import { describe, it, expect } from 'vitest';
import sql from '../../supabase/admin_match_overrides.sql?raw';

// The admin-correction RPCs are the ONLY path by which a browser can change a result that
// the leaderboard is scored from. They run SECURITY DEFINER (bypassing RLS), so their guards
// are load-bearing security, not style. This reads the migration as text — the same technique
// serverScoring.test.ts uses for the edge function — so a future edit that drops a guard fails
// here instead of silently opening the tournament up to any signed-in user.
describe('admin_match_overrides.sql — the correction RPCs keep their guards', () => {
  const body = (fn: string): string => {
    // The function body from its CREATE through the closing `$$;`
    const start = sql.indexOf(`function public.${fn}(`);
    expect(start, `${fn} is defined`).toBeGreaterThan(-1);
    const end = sql.indexOf('$$;', start);
    expect(end, `${fn} body terminates`).toBeGreaterThan(start);
    return sql.slice(start, end);
  };

  for (const fn of ['set_match_override', 'clear_match_override']) {
    it(`${fn} refuses a caller who is not an admin`, () => {
      const b = body(fn);
      expect(b, `${fn} checks is_admin()`).toMatch(/if\s+not\s+public\.is_admin\(\)/);
      expect(b, `${fn} raises on a non-admin`).toMatch(/raise exception/);
    });

    it(`${fn} is SECURITY DEFINER with a pinned search_path`, () => {
      // Without `set search_path`, a definer function is vulnerable to search_path hijacking.
      expect(body(fn)).toMatch(/security definer[\s\S]*set search_path = public/);
    });

    it(`${fn} is executable by authenticated users but not by PUBLIC`, () => {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`));
    });
  }

  it('set_match_override only accepts a winner from that match pairing', () => {
    // Mirrors matches_winner_in_pairing + ingest-draw's buildMatchRows validOverride check —
    // a typo'd id must be refused, never written into everyone's score.
    expect(body('set_match_override')).toMatch(/p_winner not in \(m\.p1_id, m\.p2_id\)/);
  });

  it('set_match_override writes the durable override AND applies it to matches immediately', () => {
    const b = body('set_match_override');
    expect(b, 'persists to match_overrides so it survives the next ingest run').toMatch(/insert into public\.match_overrides/);
    expect(b, 'applies to matches so the next recompute sees it').toMatch(/update public\.matches set winner_id = p_winner/);
  });

  it('clear_match_override drops BOTH the override and the recorded winner', () => {
    // Clearing only the override would leave the manual winner frozen in matches forever,
    // because ingest-draw falls back to the existing winner when the feed has none.
    const b = body('clear_match_override');
    expect(b).toMatch(/delete from public\.match_overrides/);
    expect(b).toMatch(/update public\.matches set winner_id = null/);
  });

  it('the admin roster is not client-readable or client-writable', () => {
    // A flag on the client-writable profiles table would let a manager promote themselves.
    expect(sql).toMatch(/revoke all on public\.app_admins from anon, authenticated/);
    expect(sql).toMatch(/create table if not exists public\.app_admins/);
  });
});
