// ── Find the Wikipedia page that actually holds a tournament's singles draw ──────────────────────
//
//   node scripts/find-event-pages.mjs "2026 Hong Kong Open" "2026 Dallas Open" …
//
// build-2026-stats.mjs carries a hand-written list of event titles. When one resolves to no page,
// the players who only played that event carry no 2026 form and get priced on ranking alone.
// Guessing replacement titles by hand is how that list rotted in the first place — and a list of
// "missing" titles baked into this script rots the same way (it used to carry one, twenty-five
// titles from August). The titles now come from the command line: paste the ones the stats
// builder just reported as missing.
//
// So probe. For every title, try the shapes Wikipedia actually uses — the article itself, then the
// "– Singles" / "– Men's singles" sub-article that ATP 250/500 events put their draw on — and
// finally fall back to a search. Report the first candidate that contains real bracket templates,
// because a page that exists but holds no draw is no use to us.
//
// Read-only: prints a paste-ready list, changes nothing.

import { API, fetchWikitext, sleep } from './lib/wiki.mjs';

const TITLES = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!TITLES.length) {
  console.error('usage: node scripts/find-event-pages.mjs "<event title>" ["<event title>" …]');
  console.error('       (the titles build-2026-stats.mjs reported as missing)');
  process.exit(2);
}

// A page is only useful if it CONTAINS A DRAW. Counting bracket templates is the same signal the
// stats builder relies on, so "found" here means "the builder will actually get matches from it".
const brackets = (w) => (w.match(/\{\{\s*[0-9]+TeamBracket/gi) || []).length;
const drawOn = async (title) => {
  const r = await fetchWikitext(title);
  return r.wikitext ? brackets(r.wikitext) : 0;
};

async function search(q) {
  const url = `${API}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=6&format=json&formatversion=2&origin=*`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.query?.search ?? []).map((s) => s.title);
  } catch { return []; }
}

const candidates = (t) => [
  `${t} – Singles`,          // en dash — what Wikipedia uses
  `${t} – Men's singles`,
  t,
  `${t} (tennis)`,
];

const found = [];
const stillMissing = [];

for (const title of TITLES) {
  let hit = null;
  for (const c of candidates(title)) {
    const n = await drawOn(c);
    if (n > 0) { hit = { title: c, brackets: n, via: 'pattern' }; break; }
    await sleep(120);
  }
  if (!hit) {
    // Last resort: ask Wikipedia what it thinks this tournament is called, then test each answer.
    for (const s of await search(`${title} singles draw`)) {
      if (!/^20\d\d/.test(s)) continue;               // must be a season article
      const n = await drawOn(s);
      if (n > 0) { hit = { title: s, brackets: n, via: 'search' }; break; }
      await sleep(120);
    }
  }
  if (hit) {
    found.push({ was: title, now: hit.title, brackets: hit.brackets, via: hit.via });
    console.log(`  ✓ ${title.padEnd(44)} → ${hit.title}  (${hit.brackets} brackets, ${hit.via})`);
  } else {
    stillMissing.push(title);
    console.log(`  ✗ ${title.padEnd(44)} — no page with a draw`);
  }
  await sleep(150);
}

console.log(`\n  resolved ${found.length}/${TITLES.length}`);
if (stillMissing.length) console.log(`  still missing: ${stillMissing.join(', ')}`);
console.log('\n  paste-ready alt entries:\n');
for (const f of found) console.log(`    // ${f.was}  →  ${f.now}`);
console.log('\n' + JSON.stringify(found.map((f) => [f.was, f.now]), null, 0) + '\n');
