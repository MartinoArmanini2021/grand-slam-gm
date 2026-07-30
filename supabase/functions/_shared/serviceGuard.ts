// Authorization guard for privileged Edge Functions (recompute-score, ingest-draw).
//
// WHY THIS IS NEEDED: Supabase's `verify_jwt` only checks that the caller presents a VALID
// JWT — and the PUBLIC anon key is a valid JWT that ships in the browser bundle. So gateway
// JWT verification is NOT authorization: any visitor can invoke these functions with the
// anon key. (Confirmed: an anon-key call to recompute-score returned 200 and rescored live.)
// For ingest-draw that would be catastrophic — its `overrides` param writes match winners.
//
// The guard: require the SERVICE-ROLE key in the Authorization header. The cron already
// sends exactly that (`Authorization: Bearer <SERVICE_ROLE_KEY>`), so it keeps working;
// anon and end-user JWTs are rejected with 401. Returns a Response to short-circuit, or null.
export function assertServiceRole(req: Request): Response | null {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const expected = `Bearer ${key}`;
  const got = req.headers.get('Authorization') ?? '';
  // key must exist AND the header must match it exactly (a user/anon JWT never will).
  if (!key || got !== expected) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
