// notify-unsubscribe — turns market emails off from the link in every email. Public (verify_jwt OFF
// for this function only: the HMAC token in the link is the guard). NOT DEPLOYED.
// Env: NOTIFY_UNSUB_SECRET (same value as send-notifications).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleUnsubscribe } from './handler.ts';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handleUnsubscribe(req, {
    secret: Deno.env.get('NOTIFY_UNSUB_SECRET') ?? '',
    unsubscribe: async (userId) => {
      const { data, error } = await client.rpc('unsubscribe_reminders', { p_user: userId });
      if (error) throw error;
      return Boolean(data);
    },
  }),
);
