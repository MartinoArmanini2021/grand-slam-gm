-- ── Per-account first-run tour flag ──────────────────────────────────────────
-- When the manager finished/skipped the tabs tour. NULL = never seen. Read on login (fetchProfile)
-- to decide whether to show the tour; written once by markTourSeen(). Being on the account (not a
-- device), the tour never re-shows on a new browser/device or after a cache clear.
--
-- Column-add only — the existing "own profile update" RLS policy (schema.sql) already lets a user
-- write their own row, so markTourSeen()'s UPDATE is permitted with no new policy.
alter table public.profiles add column if not exists tour_seen_at timestamptz;
