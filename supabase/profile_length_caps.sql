-- ─────────────────────────────────────────────────────────────────────────────
-- B5 — bound profile field lengths. `profiles` is written by a direct upsert (saveProfile)
-- with no length limits, so a client could store a multi-MB username/team name. These caps
-- are generous (normal values pass) but stop the abuse. Client inputs already enforce
-- maxLength ≤ these, so a legit user never hits the DB error.
--
-- ⚠️ STEP 1 — PRE-CHECK (run this ALONE first). It MUST return 0 rows. If it returns any row,
-- a pre-existing value exceeds a cap and the ALTER in Step 2 would FAIL — shorten those first.
-- ─────────────────────────────────────────────────────────────────────────────
select id,
       char_length(coalesce(username,'')) as username_len,
       char_length(coalesce(first_name,'')) as first_len,
       char_length(coalesce(last_name,'')) as last_len,
       char_length(coalesce(country,'')) as country_len,
       char_length(coalesce(team_name,'')) as team_name_len,
       char_length(coalesce(team_emblem,'')) as emblem_len
  from public.profiles
 where char_length(coalesce(username,''))    > 30
    or char_length(coalesce(first_name,''))  > 50
    or char_length(coalesce(last_name,''))   > 50
    or char_length(coalesce(country,''))     > 60
    or char_length(coalesce(team_name,''))   > 40
    or char_length(coalesce(team_emblem,'')) > 16;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — add the caps (only after Step 1 returns 0 rows). Idempotent; enforced on every
-- future insert/update of profiles. (If Step 1 ever DID return rows and you can't shorten
-- them, swap `add constraint … check (…)` for `add constraint … check (…) not valid` to
-- enforce on new writes only and grandfather existing rows.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_len_chk;
alter table public.profiles add constraint profiles_len_chk check (
  char_length(coalesce(username,''))    <= 30 and
  char_length(coalesce(first_name,''))  <= 50 and
  char_length(coalesce(last_name,''))   <= 50 and
  char_length(coalesce(country,''))     <= 60 and
  char_length(coalesce(team_name,''))   <= 40 and
  char_length(coalesce(team_emblem,'')) <= 16
);
