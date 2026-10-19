// send-notifications — the market emails (growth plan item 1, 2026-10-20). Started every 10 minutes by
// pg_cron (the commented schedule in supabase/2026-10-20_notifications.sql), service role only.
// The logic is notify.ts. NOT DEPLOYED: deploy only on Martino's word.
//
// Env: RESEND_API_KEY (missing = dry run) · NOTIFY_FROM (e.g. "Grand Slam GM <hello@mail.grandslamgm.com>")
//      PUBLIC_APP_URL (https://grandslamgm.com) · NOTIFY_UNSUB_SECRET (the unsubscribe token key)
//      SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { assertServiceRole } from '../_shared/serviceGuard.ts';
import { resendSender, runNotifications, type Candidate, type NotifyDb } from './notify.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const denied = assertServiceRole(req);
  if (denied) return denied;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const client = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const must = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw r.error;
    return r.data;
  };
  const db: NotifyDb = {
    mode: async () => {
      const row = must(await client.from('app_config').select('value').eq('key', 'notify_mode').maybeSingle()) as { value: string } | null;
      const v = row?.value;
      return v === 'live' || v === 'dry_run' ? v : 'off';
    },
    candidates: async () => must(await client.rpc('notification_candidates')) as Candidate[],
    claim: async (c, dry) =>
      must(await client.rpc('claim_notification', {
        p_user: c.user_id, p_tournament: c.tournament_id, p_kind: c.kind, p_round: c.round, p_dry_run: dry,
      })) as boolean,
    failed: async (c, detail) => {
      must(await client.rpc('notification_failed', {
        p_user: c.user_id, p_tournament: c.tournament_id, p_kind: c.kind, p_round: c.round, p_detail: detail,
      }));
    },
  };
  const apiKey = Deno.env.get('RESEND_API_KEY') || undefined;
  const from = Deno.env.get('NOTIFY_FROM') ?? '';
  try {
    const summary = await runNotifications(
      db,
      {
        apiKey,
        from,
        appUrl: Deno.env.get('PUBLIC_APP_URL') ?? 'https://grandslamgm.com',
        functionsUrl: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`,
        secret: Deno.env.get('NOTIFY_UNSUB_SECRET') ?? '',
      },
      apiKey ? resendSender(apiKey, from) : async () => {},
    );
    return json({ ok: true, summary });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : JSON.stringify(err) }, 500);
  }
});
