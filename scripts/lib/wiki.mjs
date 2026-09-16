// ── The one Wikipedia fetch ──────────────────────────────────────────────────────────────────────
// Five scripts used to carry their own copy: one with a User-Agent and back-off, four without, so
// the same title could be "found" by one tool and "missing" by the next during a throttle. This is
// the robust one, and every caller now gets the same three honest answers:
//   { wikitext }         the page exists and has text
//   { missing: true }    the page does not exist (a 404 or a missingtitle error) — not a throttle
//   { throttled: true }  Wikipedia refused, or the network failed, after every retry — RETRY, and
//                        never read it as "no draw" or "no such page"

export const API = 'https://en.wikipedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'GrandSlamGM-tooling/1.0 (fantasy tennis app; contact: martinoarmanini@gmail.com)' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWikitext(title, { attempts = 4 } = {}) {
  const url = `${API}?action=parse&prop=wikitext&formatversion=2&format=json&origin=*&page=${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return { missing: true };                        // the page truly doesn't exist
      if (res.status === 429 || res.status >= 500) { await sleep(800 * (attempt + 1)); continue; }
      if (!res.ok) return { throttled: true, status: res.status };
      const j = await res.json();
      if (j.error) return j.error.code === 'missingtitle' ? { missing: true } : { throttled: true, error: j.error.code };
      const wikitext = j.parse?.wikitext;
      return typeof wikitext === 'string' ? { wikitext } : { missing: true };
    } catch { await sleep(600 * (attempt + 1)); }
  }
  return { throttled: true };                                                  // retries exhausted — distinct from missing
}

// A draw page's wikitext — the exact source the live feed polls, so the tooling and the app can
// never read different draws — or a thrown error that says WHICH of the two failures it was.
export async function fetchDraw(page) {
  const r = await fetchWikitext(page);
  if (r.wikitext) return r.wikitext;
  throw new Error(r.missing
    ? `could not load draw page "${page}": no such page`
    : `could not load draw page "${page}": Wikipedia throttled or unreachable — retry, do NOT read this as "no draw"`);
}
