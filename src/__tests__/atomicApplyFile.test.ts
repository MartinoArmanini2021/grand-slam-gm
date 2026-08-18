import { describe, it, expect } from 'vitest';
import atomic from '../../supabase/apply_step2_step3_atomic.sql?raw';
import seed from '../../supabase/seed_cincinnati_player_stats.sql?raw';
import saveEntry from '../../supabase/save_entry_rpc.sql?raw';

// ── The combined step-2+3 file must never drift from the two files it carries ────────────────────
//
// WHY IT EXISTS AT ALL. Step 1 parks all 109 pre-existing player rows as 'legacy_unscoped'; the
// seed then writes Cincinnati's 96 under 'cincinnati_2026'. In between, every Cincinnati player has
// TWO rows — and the save_entry deployed right now joins player_stats by id alone, with no
// tournament filter. That join returns each squad member twice, so the tier quota counts double
// (a legal 2/3/5 reads as 4/6/10) and the budget sums double (a $148M squad reads as $296M). Every
// save in that window fails, blaming the manager for a rule they did not break. Reversing the order
// fails too: the new function filters on the tournament and would find no rows yet. Only applying
// both in ONE transaction closes the window.
//
// WHY THIS TEST. A combined file is a copy, and copies rot. If someone edits save_entry_rpc.sql and
// forgets this file, the founder pastes a stale function into production and the security fix it
// was carrying silently does not ship.
describe('apply_step2_step3_atomic.sql', () => {
  it('carries the seed file verbatim', () => {
    expect(atomic).toContain(seed.trim());
  });

  it('carries the save_entry file verbatim', () => {
    expect(atomic).toContain(saveEntry.trim());
  });

  it('wraps both in a single transaction', () => {
    const begins = [...atomic.matchAll(/^begin;$/gm)];
    const commits = [...atomic.matchAll(/^commit;$/gm)];
    expect(begins).toHaveLength(1);
    expect(commits).toHaveLength(1);
    // and the transaction must actually enclose the payload, not trail it
    expect(begins[0].index!).toBeLessThan(atomic.indexOf('insert into public.player_stats'));
    expect(commits[0].index!).toBeGreaterThan(atomic.indexOf('create or replace function public.save_entry'));
  });

  it('seeds before it replaces the function', () => {
    // The new function validates squads against this tournament's rows. If it were replaced first,
    // the rows would not exist yet and every save inside the transaction would be invalid.
    expect(atomic.indexOf('insert into public.player_stats'))
      .toBeLessThan(atomic.indexOf('create or replace function public.save_entry'));
  });

  it('upserts on the composite key, which only exists after step 1', () => {
    expect(atomic).toContain('on conflict (tournament_id, id)');
  });
});
