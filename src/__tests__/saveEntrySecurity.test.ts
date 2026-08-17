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
