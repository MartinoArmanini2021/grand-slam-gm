-- ── Undo the scoring self-test — back to dormant, no trace ────────────────────
delete from public.matches where tournament_id = 'wimbledon_2026';
update public.entries set score = 0 where tournament_id = 'wimbledon_2026';
