-- ── Pipeline watchdog: alert within ~15 min if ingest OR scoring stalls ──────────────────────────
-- WHY: the freeze that cost us a day was SILENT. This checks both crons every 15 minutes and pings
-- your Slack/Discord webhook if either goes stale — so a stall becomes a 15-minute alert, never an
-- overnight surprise. Throttled to ~1 alert/hour while stale so it reminds without spamming.
--
-- PREREQUISITES: supabase/app_config.sql (active_tournament_id), and supabase/vault_setup.sql with the
-- `gsgm_alert_webhook` secret set to your webhook URL (the optional block #2 in that file).
-- Apply this whole file in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Scoring heartbeat, written by the recompute-score edge function on each successful run (mirrors
-- ingest_health). A stale last_run_at = the scorer has stopped. Anon-readable (non-PII), like ingest_health.
create table if not exists public.scoring_health (
  tournament_id  text primary key,
  last_run_at    timestamptz,
  ok             boolean,
  entries_scored int,
  error          text
);
grant select on public.scoring_health to anon, authenticated;

-- Small single-row state so we can throttle alerts to ~1/hour while a stall persists.
create table if not exists public.watchdog_state (
  id int primary key default 1,
  last_alert_at timestamptz,
  constraint watchdog_state_single check (id = 1)
);
insert into public.watchdog_state (id) values (1) on conflict do nothing;

-- The check-and-alert. SECURITY DEFINER so it can read Vault (the webhook) as the owner.
create or replace function public.pipeline_watchdog() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tid        text := public.active_tournament_id();
  v_webhook    text;
  v_ingest_age interval;
  v_ingest_ok  boolean;
  v_score_age  interval;
  v_score_ok   boolean;
  v_alerts     text[] := '{}';
  v_last_alert timestamptz;
  v_text       text;
begin
  select decrypted_secret into v_webhook from vault.decrypted_secrets where name = 'gsgm_alert_webhook';
  if v_webhook is null or v_webhook = '' then return; end if;   -- no webhook configured → nothing to do

  -- ── FRESHNESS IS NOT ENOUGH: check `ok` TOO ────────────────────────────────────────────────────
  -- This watchdog originally alerted only on staleness, and that left the exact hole it was built
  -- to close. ingest-draw's catch block upserts ingest_health with `ok: false` AND a fresh
  -- `last_run_at` on every failure (functions/ingest-draw/index.ts, the catch at the bottom) — the
  -- table is written on EVERY run, success and failure alike. So a feed failing on all 288 runs a
  -- day kept a perfectly fresh heartbeat, v_ingest_age stayed ~5 minutes forever, and the alert
  -- never fired. Meanwhile recompute-score succeeds happily against an unchanging matches table, so
  -- scoring looked healthy too. Results stop, the leaderboard freezes, nothing says a word: the
  -- exact ~12h silent-freeze class this file exists to prevent.
  --
  -- A heartbeat that keeps ticking while the thing it monitors is dead is worse than no heartbeat,
  -- because it is read as proof of health. Alert if the feed is stale OR reporting failure.

  -- Ingest (the cron runs every 5 min; >20 min stale = 4 missed runs = a real failure).
  select now() - last_run_at, ok into v_ingest_age, v_ingest_ok
    from public.ingest_health where tournament_id = v_tid;
  if v_ingest_age is null or v_ingest_age > interval '20 minutes' then
    v_alerts := array_append(v_alerts, '• INGEST stale — last ran ' || coalesce(v_ingest_age::text, 'never') || ' ago');
  elsif v_ingest_ok is not true then
    v_alerts := array_append(v_alerts, '• INGEST FAILING — running on time but reporting an error: '
      || coalesce((select left(error, 200) from public.ingest_health where tournament_id = v_tid), 'no message'));
  end if;

  -- Scoring (skip gracefully if the edge fn heartbeat hasn't populated the table yet).
  begin
    select now() - last_run_at, ok into v_score_age, v_score_ok
      from public.scoring_health where tournament_id = v_tid;
    if v_score_age is null or v_score_age > interval '20 minutes' then
      v_alerts := array_append(v_alerts, '• SCORING stale — last ran ' || coalesce(v_score_age::text, 'never') || ' ago');
    elsif v_score_ok is not true then
      v_alerts := array_append(v_alerts, '• SCORING FAILING — running on time but reporting an error: '
        || coalesce((select left(error, 200) from public.scoring_health where tournament_id = v_tid), 'no message'));
    end if;
  exception when undefined_table then null;
  end;

  if array_length(v_alerts, 1) is null then return; end if;    -- everything healthy

  -- Throttle: at most one alert per hour while the stall persists.
  select last_alert_at into v_last_alert from public.watchdog_state where id = 1;
  if v_last_alert is not null and now() - v_last_alert < interval '55 minutes' then return; end if;

  v_text := '🔴 Grand Slam GM pipeline (' || v_tid || '):' || chr(10)
         || array_to_string(v_alerts, chr(10)) || chr(10)
         || 'Check the crons + the Vault key — see docs/PIPELINE_OPS.md.';

  -- Send both keys so it works for a Discord ("content") OR a Slack ("text") webhook.
  perform net.http_post(
    url     := v_webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('content', v_text, 'text', v_text)
  );
  update public.watchdog_state set last_alert_at = now() where id = 1;
end $$;

revoke all on function public.pipeline_watchdog() from anon, authenticated;

-- Run it every 15 minutes.
select cron.unschedule('pipeline-watchdog') where exists (select 1 from cron.job where jobname = 'pipeline-watchdog');
select cron.schedule('pipeline-watchdog', '*/15 * * * *', $$ select public.pipeline_watchdog(); $$);

-- Test it now (temporarily): this should post to your webhook IF something is currently stale,
-- or do nothing if all healthy. To force a test message regardless, run against a fake stale state.
-- select public.pipeline_watchdog();
