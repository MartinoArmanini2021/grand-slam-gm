// ── Analytics ────────────────────────────────────────────────────────────────
// One thin, provider-agnostic layer. The whole app calls track()/identify(); this
// file decides where those go. It is a PURE NO-OP (and loads nothing) unless a key is
// configured via VITE_POSTHOG_KEY, so the app behaves identically until you switch it
// on — and posthog-js is only ever fetched (as a separate chunk) when a key exists.
//
// To swap providers (e.g. to a first-party Supabase events table) you only rewrite the
// three functions here; the dozens of track() calls across the app never change.
//
// Turn it on: set VITE_POSTHOG_KEY (and optionally VITE_POSTHOG_HOST) in .env, redeploy.

type Props = Record<string, unknown>;

let ph: { capture: (e: string, p?: Props) => void; identify: (id: string, p?: Props) => void; reset: () => void } | null = null;
let ready = false;
const queue: Array<[string, Props | undefined]> = [];
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

// Load + start the provider once, on app boot. Safe to call when unconfigured (no-op).
export async function initAnalytics(): Promise<void> {
  if (!KEY || ready) return;
  try {
    const mod = await import('posthog-js');
    const posthog = mod.default;
    posthog.init(KEY, {
      api_host: (import.meta.env.VITE_POSTHOG_HOST as string) || 'https://us.i.posthog.com',
      capture_pageview: false, // SPA — we send explicit tab_view events (see App.tsx)
      autocapture: true,       // also record every click/input automatically = "everything"
      persistence: 'localStorage',
    });
    ph = posthog as unknown as typeof ph;
    ready = true;
    for (const [e, p] of queue) ph!.capture(e, p);
    queue.length = 0;
  } catch { /* analytics must NEVER break the app */ }
}

// Record an event. Buffers until the provider is ready; no-ops entirely when unconfigured.
export function track(event: string, props?: Props): void {
  try {
    if (ready && ph) ph.capture(event, props);
    else if (KEY) queue.push([event, props]);
  } catch { /* ignore */ }
}

// Tie subsequent events to a signed-in account (call on login).
export function identify(id: string, props?: Props): void {
  try { if (ready && ph) ph.identify(id, props); } catch { /* ignore */ }
}

// Forget the identity (call on sign-out) so the next person isn't merged into it.
export function resetIdentity(): void {
  try { if (ready && ph) ph.reset(); } catch { /* ignore */ }
}
