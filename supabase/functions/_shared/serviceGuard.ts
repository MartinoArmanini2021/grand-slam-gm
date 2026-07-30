// Authorization guard for privileged Edge Functions (recompute-score, ingest-draw).
//
// Only the SERVICE ROLE may invoke these. We check the ROLE CLAIM of the caller's JWT
// (role === 'service_role') rather than string-equality with SUPABASE_SERVICE_ROLE_KEY —
// that env value can differ from the exact key pasted into the cron (new vs legacy key
// formats, rotation, how the platform injects it), which produced false 401s and stopped
// the scoring cron even with a correct key.
//
// SAFE because Supabase's gateway (verify_jwt, ON by default) VERIFIES the JWT SIGNATURE
// before this function runs: a client cannot forge a `service_role` token (the JWT secret is
// server-only), and the public anon key (role 'anon') / end-user tokens (role 'authenticated')
// fail the role check. The cron sends the service_role key, so it passes.
// ⚠️ Do NOT disable `verify_jwt` on these functions — without gateway signature verification a
// forged unsigned token could pass this role check.
function decodeJwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function assertServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (decodeJwtRole(token) === 'service_role') return null;
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
