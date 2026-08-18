import { describe, it, expect } from 'vitest';
import atomic from '../../supabase/apply_step2_step3_atomic.sql?raw';
import seed from '../../supabase/seed_cincinnati_player_stats.sql?raw';
import saveEntry from '../../supabase/save_entry_rpc.sql?raw';
import { PLAYERS } from '../data/players';

// ── The combined step-2 file, and why it is shaped the way it is ─────────────────────────────────
//
// Step 1 parked all 109 pre-existing player rows as 'legacy_unscoped'. All 96 Cincinnati players
// were ALREADY in that table, so seeding them under 'cincinnati_2026' would leave every one of them
// with TWO rows. The save_entry deployed right now joins player_stats by id alone, with no
// tournament filter, for both the tier quota and the budget sum — so each squad member would be
// counted twice: a legal 2/3/5 squad reads as 4/6/10, a $148M squad sums to $296M, and every save
// is rejected. Worse than rejected: CloudSync responds to a validation reject by calling
// revertToCloud(), so the manager's edit is DISCARDED under a toast blaming them for a rule they
// did not break. Reversing the order fails too — the scoped function would find no rows yet.
//
// So the file MOVES the 96 out of the parked set rather than adding a second copy (ids stay unique
// at every instant, even for the unscoped function still live), and wraps everything in one
// transaction as a second, independent defence.
describe('apply_step2_step3_atomic.sql', () => {
  const moveList = (() => {
    const start = atomic.indexOf('and id in (');
    const end = atomic.indexOf('   );', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return [...atomic.slice(start, end).matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1]);
  })();

  it('carries the seed file verbatim', () => {
    expect(atomic).toContain(seed.trim());
  });

  it('carries the save_entry file verbatim', () => {
    expect(atomic).toContain(saveEntry.trim());
  });

  // THE CORE INVARIANT. If the move list and the seed ever disagree, a player is either left parked
  // (so the seed adds a duplicate and the double-count returns) or moved without being seeded.
  it('moves exactly the players the seed writes — no more, no less', () => {
    const seedIds = [...seed.matchAll(/\('cincinnati_2026',\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
    expect(seedIds).toHaveLength(96);
    expect([...moveList].sort()).toEqual([...seedIds].sort());
  });

  // The move list must be the FIELD, not "every row that happens to look complete". A price/tier
  // heuristic would also promote these seven, who are residue from older fields and are not in the
  // Cincinnati draw — registering them as legal picks for a tournament they are not playing.
  it('never promotes a non-entrant', () => {
    const field = new Set(PLAYERS.map(p => p.id));
    expect(moveList.filter(id => !field.has(id))).toEqual([]);
    for (const ghost of ['bublik', 'davidovichfokina', 'diallo', 'moutet', 'munar', 'popyrin', 'quinn']) {
      expect(moveList).not.toContain(ghost);
    }
  });

  it('wraps everything in a single transaction, enclosing the payload', () => {
    const begins = [...atomic.matchAll(/^begin;$/gm)];
    const commits = [...atomic.matchAll(/^commit;$/gm)];
    expect(begins).toHaveLength(1);
    expect(commits).toHaveLength(1);
    expect(begins[0].index!).toBeLessThan(atomic.indexOf('update public.player_stats'));
    expect(commits[0].index!).toBeGreaterThan(atomic.indexOf('create or replace function public.save_entry'));
  });

  it('moves, then seeds, then replaces the function', () => {
    const move = atomic.indexOf('update public.player_stats');
    const ins = atomic.indexOf('insert into public.player_stats');
    const fn = atomic.indexOf('create or replace function public.save_entry');
    expect(move).toBeLessThan(ins);
    expect(ins).toBeLessThan(fn);
  });

  it('upserts on the composite key, which only exists after step 1', () => {
    expect(atomic).toContain('on conflict (tournament_id, id)');
  });

  // This project's documented failure mode is a paste that reports success having done nothing.
  // The assertions run INSIDE the transaction, so a wrong end state rolls the whole thing back and
  // surfaces an error instead of a false success.
  it('asserts its own end state before committing', () => {
    const assertBlock = atomic.slice(atomic.lastIndexOf('do $$'), atomic.indexOf('commit;'));
    expect(assertBlock).toMatch(/should have exactly 96 players/);
    expect(assertBlock).toMatch(/missing price or tier/);
    expect(assertBlock).toMatch(/more than one tournament/);
    expect(assertBlock).toMatch(/v_stored_has_transfers/); // the salary-cap fix actually installed
    expect(atomic.lastIndexOf('do $$')).toBeLessThan(atomic.indexOf('commit;'));
  });
});
