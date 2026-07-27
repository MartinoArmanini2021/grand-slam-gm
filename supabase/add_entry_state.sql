-- Add the entries.state snapshot column (full client game state, for faithful
-- cross-device restore) and tighten score so the client can't seed it on insert
-- either. Safe to run on the existing database; re-runnable.

alter table public.entries add column if not exists state jsonb not null default '{}';

revoke insert (score) on public.entries from authenticated;
revoke update (score) on public.entries from authenticated;
