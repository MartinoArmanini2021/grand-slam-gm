import { describe, it, expect } from 'vitest';

// ── save_entry security invariants ───────────────────────────────────────────────────────────────
// save_entry is the ONLY write path to entries, so a limit it fails to enforce is not enforced at
// all. These read the SQL and assert the shape of the guards. They are text-level assertions, which
// is unusual — but the alternative is a live Postgres, and rpcDrift.integration.test.ts (which needs
// one) is skipped in CI. A cheap guard that runs on every push beats a thorough one that never does.

const SQL = (): Promise<string> =>
  import('../../supabase/save_entry_rpc.sql?raw').then(m => m.default);

describe('save_entry — limits must never be decided by client-supplied state', () => {
  // THE BUG THIS PINS: the $150M cap was gated on `if not v_has_transfers`, where v_has_transfers
  // came from p_state — the raw client payload. Any signed-in caller could invent one transfer
  // entry and save a squad at any price. Squad size and the 2/3/5 quota still held; the cap did not,
  // for the whole draft window. The gate must read the STORED row, which only this RPC can write.
  it('the budget gate reads the STORED entry, never p_state', async () => {
    const sql = await SQL();
    expect(sql).toMatch(/if not v_stored_has_transfers then/);
    expect(sql).not.toMatch(/if not v_has_transfers then\s*\n\s*select coalesce\(sum\(ps\.price\)/);
    // and the trustworthy variable is derived from the locked row, not the payload
    expect(sql).toMatch(/v_stored_has_transfers\s*:=\s*v_found\s*\n?\s*and jsonb_array_length\(coalesce\(v_existing\.state->'transfers'/);
  });

  it('the stored entry is locked BEFORE the validation gates run', async () => {
    const sql = await SQL();
    const lock = sql.indexOf('for update');
    const budgetGate = sql.indexOf('if not v_stored_has_transfers then');
    expect(lock).toBeGreaterThan(-1);
    expect(budgetGate).toBeGreaterThan(-1);
    // If the lock ever drifts back below the gate, the gate has nothing trustworthy to read and the
    // bypass returns — this ordering IS the fix.
    expect(lock).toBeLessThan(budgetGate);
  });

  it('there is exactly ONE row lock (the pre-validation one), not a leftover duplicate', async () => {
    const sql = await SQL();
    expect((sql.match(/for update/g) ?? []).length).toBe(1);
  });

  it('still enforces the cap, the quota and the size — the fix must not have relaxed anything', async () => {
    const sql = await SQL();
    expect(sql).toMatch(/over the \$150M budget/);
    expect(sql).toMatch(/exactly 2 Platinum, 3 Gold, 5 Silver/);
    expect(sql).toMatch(/exactly 10 players to lock/);
    expect(sql).toMatch(/used all 3 transfers/);
  });
});

// ── The scoring squad must obey the same rules as the visible one ────────────────────────────────
//
// recompute-score scores EXCLUSIVELY off state.initialSquad and never falls back to myTeam. Until
// 2026-08-19 that array was validated nowhere: every gate read v_squad (built from myTeam) while
// the insert stored p_state verbatim. A caller could send a legal 10-player myTeam through the
// front door and attach an initialSquad naming all 96 entrants — no size cap, no budget, no tier
// quota, not even a check that the ids were real. Measured against this game's own scoring model
// that squad scores ~328 points against ~86 for the best legal one, roughly 3.8x.
//
// Fixing the v_touched flag alone would have achieved nothing: v_touched gates myTeam, and myTeam
// is not what scores.
describe('save_entry — initialSquad is validated, because it is what scores', () => {
  it('applies size, duplicate, known-player, tier and budget rules to initialSquad', async () => {
    const sql = await SQL();
    expect(sql).toMatch(/v_init := array\(select jsonb_array_elements_text\(coalesce\(p_state->'initialSquad'/);
    expect(sql).toMatch(/Your drafted squad has duplicate players/);
    expect(sql).toMatch(/Your drafted squad must be exactly 10 players/);
    expect(sql).toMatch(/Your drafted squad contains an unknown player/);
    expect(sql).toMatch(/Your drafted squad must be exactly 2 Platinum, 3 Gold, 5 Silver/);
    expect(sql).toMatch(/Your drafted squad costs \$%M, over the \$150M budget/);
  });

  // The budget test must be > 150, never >= 150. Three of the four live Cincinnati managers drafted
  // squads costing EXACTLY $150M; an off-by-one here would have locked them out of their own entries
  // on their next save, which is a worse outcome than the hole being closed is a better one.
  it('rejects only squads OVER budget, never those exactly at it', async () => {
    const sql = await SQL();
    const guard = sql.slice(sql.indexOf('v_init_total'), sql.indexOf('Your drafted squad costs'));
    expect(guard).toMatch(/if v_init_total > 150 then/);
    expect(guard).not.toMatch(/>=\s*150/);
  });

  // Deliberately NOT gated on v_locked or v_touched: both are derived from the client payload, and
  // hanging the only defence of the scoring field on an attacker-chosen string is how the hole
  // existed. The single guard is "is initialSquad present at all" — absent while drafting, complete
  // and legal thereafter. There is no third legitimate state.
  it('does not gate the initialSquad checks behind a client-supplied flag', async () => {
    const sql = await SQL();
    const block = sql.slice(sql.indexOf('v_init_size := '), sql.indexOf('-- LOCK + LOAD THE STORED ENTRY'));
    expect(block).toMatch(/if v_init_size > 0 then/);
    expect(block).not.toMatch(/v_touched/);
    expect(block).not.toMatch(/v_locked/);
  });
});
