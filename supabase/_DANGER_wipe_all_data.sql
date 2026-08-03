-- ⛔⛔⛔  DANGER — THIS FILE DELETES ALL GAME DATA  ⛔⛔⛔
-- Every squad (public.entries) and every private league are wiped. There is NO undo.
-- This was the one-time PRE-LAUNCH clean-slate. The tournament is now LIVE with real
-- friends' squads — running this destroys them.
--
-- It is intentionally INERT: the statements are commented out AND gated behind a guard
-- variable, so pasting the whole file does nothing. To actually run it you must both
-- (1) uncomment the block and (2) set the guard to 'YES_WIPE_EVERYTHING'. Two deliberate
-- steps, so this can never fire by accident or by a stray re-run of launch_prep.sql.

do $$
declare
  i_really_mean_it text := 'no';   -- change to 'YES_WIPE_EVERYTHING' ONLY if you truly intend it
begin
  if i_really_mean_it <> 'YES_WIPE_EVERYTHING' then
    raise notice 'Guard not set — nothing deleted. This is the safe default.';
    return;
  end if;

  -- delete from public.entries;                                 -- ← every squad, all tournaments
  -- delete from public.leagues where is_public = false;          -- ← every private league (cascades memberships)
  raise exception 'Refusing to run: uncomment the delete statements above to proceed.';
end $$;
