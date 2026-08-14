-- ── Store the cron's secrets in Supabase Vault (do this ONCE) ────────────────────────────────────
-- WHY: the crons used to contain a <SERVICE_ROLE_KEY> placeholder you had to re-paste every time you
-- re-ran them — mis-paste it (e.g. grab the anon key) and the whole pipeline freezes SILENTLY. That's
-- exactly what bit us. After this, the crons read the key from Vault BY NAME. You paste the key here
-- once, ever. Rotating it later, or re-running the crons for Cincinnati, can never mis-paste it again.
--
-- Vault is a built-in Supabase feature. If the CREATE EXTENSION line errors, enable it once in the
-- dashboard: Database → Extensions → search "vault" → enable, then re-run this file.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create extension if not exists supabase_vault;

-- 1) THE SERVICE-ROLE KEY — the one thing that broke. Paste your real service_role key
--    (Settings → API → the row named `service_role`, tagged `secret`, starts with eyJ… — NOT anon).
--    Run this block once. It's safe to re-run: it updates the stored key if it already exists.
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'gsgm_service_role_key';
  if v_id is null then
    perform vault.create_secret('PASTE_YOUR_service_role_KEY_HERE', 'gsgm_service_role_key',
      'service_role key the ingest + scoring crons use to call the edge functions');
  else
    perform vault.update_secret(v_id, 'PASTE_YOUR_service_role_KEY_HERE');
  end if;
end $$;

-- 2) (Optional, for alerting — Part 2) your Slack/Discord webhook URL to be pinged when the pipeline
--    stalls. Uncomment + paste your webhook URL, then run. Skip if you haven't made one yet.
-- do $$
-- declare v_id uuid;
-- begin
--   select id into v_id from vault.secrets where name = 'gsgm_alert_webhook';
--   if v_id is null then perform vault.create_secret('PASTE_WEBHOOK_URL', 'gsgm_alert_webhook', 'Pipeline stall alert webhook');
--   else perform vault.update_secret(v_id, 'PASTE_WEBHOOK_URL'); end if;
-- end $$;

-- 3) VERIFY the key is stored + readable — this should print "Bearer eyJ…" (NOT "Bearer PASTE…" and
--    NOT the anon key). If it looks right, the crons will work.
select 'Bearer ' || left(decrypted_secret, 12) || '…(hidden)' as check_authorization_header
from vault.decrypted_secrets where name = 'gsgm_service_role_key';
