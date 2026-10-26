// Runs an edge function's REAL handler under Node, for tests (26 Oct 2026).
//
// The functions call Deno.serve at load, so they can't be imported. This strips their import lines,
// transpiles the whole file with esbuild and evaluates it with stand-ins for what Deno and the
// imports provide: Deno.serve captures the handler, `fetch` is a fake network (PostgREST and
// Wikipedia), `setTimeout` records each wait and fires at once. createClient is the real
// supabase-js, so every query goes through the same client and retryingFetch that ship.
import { transformSync } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

export const DB_URL = 'http://db.test';

export type Call = { method: string; table: string; url: URL; body: unknown };
export type Reply = { status: number; body: unknown };
/** Answers one request; return undefined for "not expected" (the test then fails loudly). */
export type Router = (call: Call, nth: number) => Reply | undefined;

export interface Harness {
  handler: (req: Request) => Promise<Response>;
  calls: Call[];
  waits: number[];
  /** Requests to one table, in order. */
  to: (table: string, method?: string) => Call[];
}

export function loadEdge(src: string, route: Router, extra: Record<string, unknown> = {}): Harness {
  const calls: Call[] = [];
  const waits: number[] = [];
  const seen: Record<string, number> = {};

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const table = url.hostname === 'db.test' ? url.pathname.replace(/^\/rest\/v1\//, '') : url.hostname;
    let body: unknown = undefined;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    const call = { method, table, url, body };
    calls.push(call);
    const key = `${method} ${table}`;
    seen[key] = (seen[key] ?? 0) + 1;
    const reply = route(call, seen[key]);
    if (!reply) throw new Error(`unexpected request: ${key} (#${seen[key]})`);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status, headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  let handler: ((req: Request) => Promise<Response>) | undefined;
  const Deno = {
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
    env: { get: (k: string) => (k === 'SUPABASE_URL' ? DB_URL : 'service-key') },
  };
  const fastTimeout = (fn: () => void, ms?: number) => { waits.push(ms ?? 0); return setTimeout(fn, 0); };

  const stripped = src.replace(/\r\n/g, '\n').replace(/^import [^\n]*;$/gm, '');
  const { code } = transformSync(stripped, { loader: 'ts' });
  const names = ['Deno', 'fetch', 'setTimeout', 'createClient', ...Object.keys(extra)];
  new Function(...names, code)(Deno, fakeFetch, fastTimeout, createClient, ...Object.values(extra));
  if (!handler) throw new Error('the edge function did not call Deno.serve');

  return {
    handler,
    calls,
    waits,
    to: (table, method) => calls.filter((c) => c.table === table && (!method || c.method === method)),
  };
}

/** A token the inlined service-role guard accepts (it reads the role claim only). */
const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
export const SERVICE_TOKEN = `x.${b64url(JSON.stringify({ role: 'service_role' }))}.y`;

export const cronRequest = (body: unknown) =>
  new Request('http://edge.test/fn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const SKEW: Reply = {
  status: 401,
  body: { code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future' },
};
export const EXPIRED: Reply = {
  status: 401,
  body: { code: 'PGRST301', details: null, hint: null, message: 'JWT expired' },
};
export const ok = (body: unknown): Reply => ({ status: 200, body });
