-- ── Allow half-point scores ───────────────────────────────────────────────────
-- A vice-captain scores ×1.5, so a base-odd win (e.g. a Round-of-64 win worth 1 pt) now earns
-- 1.5. The `entries.score` column was `int`, which truncated the halves. We widen it to
-- `double precision` (NOT `numeric`: PostgREST serializes numeric as a JSON *string*, which would
-- break the client's numeric sorting/formatting — float returns as a real JSON number, and 0.5
-- steps are exact in float at these magnitudes). Run this WHOLE file once in the Supabase SQL editor.
--
-- Safe on live data: existing integer scores become 1.0, 2.0, … (no loss); the next recompute-score
-- cron rewrites everyone with the new ×1.5 rule within a few minutes.

-- board_entries reads e.score, so the view must be dropped before the column type can change.
drop view if exists public.board_entries;

alter table public.entries alter column score drop default;
alter table public.entries alter column score type double precision using score::double precision;
alter table public.entries alter column score set default 0;

-- Recreate the redacting public-leaderboard view exactly as before (now over the widened column).
create or replace view public.board_entries as
select
  e.user_id,
  e.tournament_id,
  e.score,
  e.budget,
  case
    when coalesce(e.state->>'phase', 'draft') <> 'draft' or e.user_id = auth.uid()
      then e.state
    else e.state - array['myTeam', 'initialSquad', 'captain', 'viceCaptain',
                         'captainHistory', 'viceCaptainHistory', 'transfers']
  end as state
from public.entries e;
grant select on public.board_entries to anon, authenticated;

-- The set-based scorer (called by recompute-score) must accept fractional scores.
create or replace function public.apply_entry_scores(p_tournament text, p_scores jsonb)
returns void language sql security definer set search_path = public as $$
  update public.entries e
     set score = s.score, updated_at = now()
    from jsonb_to_recordset(p_scores) as s(user_id uuid, score double precision)
   where e.user_id = s.user_id and e.tournament_id = p_tournament;
$$;
revoke all on function public.apply_entry_scores(text, jsonb) from public, authenticated, anon;
grant execute on function public.apply_entry_scores(text, jsonb) to service_role;
