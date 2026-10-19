// The email unsubscribe token: HMAC-SHA256 over the user id with NOTIFY_UNSUB_SECRET, base64url.
// Shared by send-notifications (puts it in every email) and notify-unsubscribe (checks it).
// WebCrypto only, so the same file runs in Deno and in the vitest suite. Same design as Call the
// Crown's reminder token (six-kings-game/supabase/functions/_shared/unsubToken.ts).

const enc = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function unsubToken(secret: string, userId: string): Promise<string> {
  if (!secret) throw new Error('NOTIFY_UNSUB_SECRET is not set');
  return b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(userId)));
}

/** True only for the token this secret makes for this user id (compared in constant time). */
export async function checkUnsubToken(secret: string, userId: string, token: string): Promise<boolean> {
  if (!secret || !userId || !token) return false;
  const want = await unsubToken(secret, userId);
  if (want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
