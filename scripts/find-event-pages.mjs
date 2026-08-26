// ── Find the Wikipedia page that actually holds a tournament's singles draw ──────────────────────
//
//   node scripts/find-event-pages.mjs
//
// build-2026-stats.mjs carries a hand-written list of event titles. Twenty-five of them resolve to
// no page, so ninety-five players in the pool carry no 2026 form at all and get priced on ranking
// alone. Guessing replacement titles by hand is how that list rotted in the first place.
//
// So probe instead. For every title the builder failed on, try the shapes Wikipedia actually uses —
// the article itself, then the "– Singles" / "– Men's singles" sub-article that ATP 250/500 events
// put their draw on — and finally fall back to a search. Report the first candidate that contains
// real bracket templates, because a page that exists but holds no draw is no use to us.
//
// Read-only: prints a paste-ready list, changes nothing.

const MISSING = [
  '2026 Hong Kong Open', '2026 Open Sud de France', '2026 Dallas Open', '2026 Córdoba Open',
  '2026 ABN AMRO Open', '2026 Argentina Open', '2026 Delray Beach Open', '2026 Open 13 Provence',
  '2026 Rio Open', '2026 Qatar ExxonMobil Open', '2026 Chile Open', '2026 Mexican Open',
  '2026 U.S. Men’s Clay Court Championships', '2026 Grand Prix Hassan II',
  '2026 Monte-Carlo Masters', '2026 Barcelona Open Banc Sabadell', '2026 BMW Open',
  '2026 Geneva Open', '2026 Stuttgart Open', '2026 Terra Wortmann Open',
  '2026 Mallorca Championships', '2026 Swiss Open Gstaad', '2026 Croatia Open Umag',
  '2026 Los Cabos Open', '2026 Austrian Open',
];

const API = 'https://en.wikipedia.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wikitext(title) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&formatversion=2&format=json&origin=*`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const w = j?.parse?.wikitext;
    return typeof w === 'string' ? w : null;
  } catch { return null; }
}

// A page is only useful if it CONTAINS A DRAW. Counting bracket templates is the same signal the
// stats builder relies on, so "found" here means "the builder will actually get matches from it".
const brackets = (w) => (w.match(/\{\{\s*[0-9]+TeamBracket/gi) || []).length;

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

for (const title of MISSING) {
  let hit = null;
  for (const c of candidates(title)) {
    const w = await wikitext(c);
    if (w && brackets(w) > 0) { hit = { title: c, brackets: brackets(w), via: 'pattern' }; break; }
    await sleep(120);
  }
  if (!hit) {
    // Last resort: ask Wikipedia what it thinks this tournament is called, then test each answer.
    for (const s of await search(`${title} singles draw`)) {
      if (!/^20\d\d/.test(s)) continue;               // must be a season article
      const w = await wikitext(s);
      if (w && brackets(w) > 0) { hit = { title: s, brackets: brackets(w), via: 'search' }; break; }
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

console.log(`\n  resolved ${found.length}/${MISSING.length}`);
if (stillMissing.length) console.log(`  still missing: ${stillMissing.join(', ')}`);
console.log('\n  paste-ready alt entries:\n');
for (const f of found) console.log(`    // ${f.was}  →  ${f.now}`);
console.log('\n' + JSON.stringify(found.map((f) => [f.was, f.now]), null, 0) + '\n');
