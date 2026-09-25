// Wikipedia User-Agent (adopted 2026-09-25) — run through the DEPLOYED ingest-draw helper.
//
// The edge function cannot be imported (it calls Deno.serve at load), so this test cuts its
// WIKIPEDIA FETCH block out of the source text, transpiles it with esbuild and runs it with a stub
// fetch, as armbandAuto.test.ts does for the scorer: what is tested is the code that ships.
import { describe, it, expect } from 'vitest';
import { transformSync } from 'esbuild';
import edgeSrc from '../../supabase/functions/ingest-draw/index.ts?raw';

const src = edgeSrc.replace(/\r\n/g, '\n');

function loadWikiFetch(fetchImpl: typeof fetch): (url: string) => Promise<Response> {
  const start = src.indexOf('// ════════════ WIKIPEDIA FETCH ════════════');
  const end = src.indexOf('// ════════════ END WIKIPEDIA FETCH ════════════');
  if (start < 0 || end < 0 || end < start) throw new Error('ingest-draw layout changed: WIKIPEDIA FETCH markers not found');
  const { code } = transformSync(src.slice(start, end), { loader: 'ts' });
  return new Function('fetch', `${code}\nreturn wikiFetch;`)(fetchImpl);
}

describe('ingest-draw identifies itself to Wikipedia', () => {
  it('sends a User-Agent naming the app, its site and a contact', async () => {
    let sent: Headers | undefined;
    const wikiFetch = loadWikiFetch((async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
    const res = await wikiFetch('https://en.wikipedia.org/w/api.php?action=query&format=json');
    expect(res.status).toBe(200);
    expect(sent?.get('user-agent') ?? '').toMatch(/^GrandSlamGM\/1\.0 \(https:\/\/grandslamgm\.com; [^\s()]+@[^\s()]+\)$/);
  });

  it('reaches Wikipedia only through that helper', () => {
    expect(src.match(/\bfetch\(wikiUrl\)/g) ?? []).toHaveLength(0);
    expect(src.match(/\bwikiFetch\(wikiUrl\)/g) ?? []).toHaveLength(1);
  });
});
