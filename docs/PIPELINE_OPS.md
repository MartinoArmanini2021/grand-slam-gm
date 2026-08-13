# Pipeline operations — keys, alerting, and the apply order

The live pipeline is two crons calling two edge functions:

```
ingest-draw     (Wikipedia draw → public.matches)      every 5 min
recompute-score (public.matches → public.entries.score) every 3 min
```

If either stops, the leaderboard silently freezes. On 11 Aug that happened for ~12 hours
because a cron's `Authorization` header had a **mis-pasted key** (the anon key instead of
`service_role` → every call 401'd → no results, no scores, no error anyone saw). These two
changes make that failure mode (a) impossible to re-introduce and (b) loud if anything else breaks.

## 1. The key lives in Vault — never pasted into a cron again

`supabase/vault_setup.sql` stores the `service_role` key **once** as a named Vault secret
(`gsgm_service_role_key`). Both crons read it by name:

```sql
'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'gsgm_service_role_key')
```

So re-running a cron (e.g. for Cincinnati) or rotating the key can never mis-paste it —
there is no key in the cron file to paste. Rotating the key later = one `vault.update_secret`;
the next cron run picks it up automatically.

**The key is a secret.** Paste it only into the Supabase SQL editor (never into chat, a commit,
or anywhere else). It's the row named `service_role` under Settings → API — starts with `eyJ…`,
**not** the `anon` key.

## 2. A watchdog alerts within ~15 min if either cron stalls

`supabase/pipeline_watchdog.sql` adds:

- `public.scoring_health` — a heartbeat the `recompute-score` function writes on every success
  (mirrors the existing `ingest_health`). Stale = the scorer stopped.
- `public.pipeline_watchdog()` — runs every 15 min; if `ingest_health` **or** `scoring_health`
  is older than 20 min for the active tournament, it POSTs a message to your Slack/Discord webhook.
  Throttled to ~1 alert/hour while stale, so it reminds without spamming.

The webhook URL is also a Vault secret (`gsgm_alert_webhook`) — block #2 in `vault_setup.sql`.
No webhook stored → the watchdog quietly does nothing (safe default).

To get a webhook: Discord → a channel's Settings → Integrations → Webhooks → New → Copy URL
(or Slack → Incoming Webhooks). The body sends both `content` (Discord) and `text` (Slack) keys,
so either works.

## Apply order (once)

Run these in the Supabase SQL editor, in order. Steps 1–2 you've likely already done.

1. `supabase/app_config.sql` — the single source of truth for the active tournament.
2. `supabase/vault_setup.sql` — **paste your real `service_role` key** into block #1 and run.
   Optionally uncomment block #2 and paste your webhook URL. The verify SELECT at the bottom
   should print `Bearer eyJ…`, **not** `Bearer PASTE…` and not the anon key.
3. `supabase/setup_ingest_cron.sql` — re-run (now reads the key from Vault; nothing to paste).
4. `supabase/setup_scoring_cron.sql` — re-run (same).
5. Redeploy the scorer so it writes the new heartbeat:
   ```bash
   supabase functions deploy recompute-score
   ```
6. `supabase/pipeline_watchdog.sql` — run to create the watchdog + its 15-min schedule.

## Verifying it's healthy

```sql
-- both should show a last_run_at within the last few minutes:
select 'ingest'  as feed, last_run_at, ok, error from public.ingest_health  where tournament_id = public.active_tournament_id()
union all
select 'scoring' as feed, last_run_at, ok, error from public.scoring_health where tournament_id = public.active_tournament_id();

-- all three crons registered + active:
select jobname, schedule, active from cron.job order by jobname;
```

To test the alert path end-to-end without waiting for a real outage, temporarily point the
active tournament at one with no recent runs, or briefly lower the `20 minutes` threshold in
`pipeline_watchdog()` and `select public.pipeline_watchdog();` — you should get a webhook ping.
Put the threshold back afterwards.
