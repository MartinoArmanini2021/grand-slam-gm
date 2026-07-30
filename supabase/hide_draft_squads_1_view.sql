-- ─────────────────────────────────────────────────────────────────────────────
-- B8 — Part 1 of 2: the redacting board view. SAFE to apply anytime (it only ADDS a
-- view; it does not change any existing read path yet, so nothing breaks). Apply this
-- FIRST, then deploy the app (which switches the leaderboard to read this view), THEN
-- apply Part 2 (hide_draft_squads_2_restrict.sql) to close the direct-read bypass.
--
-- What it does: exposes the leaderboard fields (score, budget, team) ALWAYS, but REDACTS
-- squad/captain/lineup keys from `state` while an entry is still in phase='draft' — EXCEPT
-- for the owner (auth.uid()), who always sees their own. Once a user locks (phase<>'draft')
-- their squad is shown, as intended. So a rival can't copy an in-progress draft.
--
-- The view runs with the view owner's rights (security_invoker=false, the default), so it
-- reads every entry and redacts by phase — the querying role (anon/authenticated) only needs
-- SELECT on the view (granted below), not on entries.
-- ─────────────────────────────────────────────────────────────────────────────

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
