// Build CURRENT (2026 YTD) player form from Wikipedia's per-tournament draw pages.
// ─────────────────────────────────────────────────────────────────────────────
//   node scripts/build-2026-stats.mjs           # fetch, aggregate, write atp300.json
//   node scripts/build-2026-stats.mjs --dry      # aggregate + report, write nothing
//   node scripts/build-2026-stats.mjs --only=slams   # majors only (quick test)
//
// CALENDAR CHECK (2026-08-26): four events were RENAMED for 2026 — Open Sud de France →
// Open Occitanie, Stuttgart Open → BOSS Open, Hong Kong Open → ATP Hong Kong Tennis Open,
// Austrian Open → Generali Open Kitzbühel — and two, Córdoba and Open 13 Provence, were not
// held at all and are removed. Source: the "2026 ATP Tour" calendar article, which lists every
// tournament and links its draw. Check there first before hunting for a title.
//
// PAGE SHAPE (learned 2026-08-26): ATP 250/500 events — and Monte-Carlo — keep only a summary on
// the season article; the DRAW lives on a "– Singles" sub-article, which is why a whole season
// of titles silently resolved to nothing. Those sub-article titles are listed FIRST in the alt
// arrays below. To find more: scripts/find-event-pages.mjs.
//
// WHY: as of mid-2026 no free STRUCTURED dataset has 2026 match data (Sackmann's repo
// was removed; TML-Database stalled at mid-Jan; UTS at end-2024). But Wikipedia's
// tournament pages ARE current and community-maintained. Each draw encodes the winner
// of every match by bolding ('''name''') — the same signal the live feed parses. We
// aggregate those into per-player 2026 W/L, surface win%, and titles.
//
// Reliability: the MediaWiki API is fetched directly (works anywhere). Winner = the
// bolded side of each pairing. Matches that appear in both a section bracket and the
// finals bracket are de-duped by unordered player pair within an event. Events the
// script can't find are SKIPPED and listed — never silently dropped. Team events
// (United/Davis/Laver Cup) are excluded. Stats are never invented.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const POOL_PATH = join(root, 'src/data/atp300.json');
const DRY = process.argv.includes('--dry');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';

// ── 2026 ATP tour-level calendar, Jan–late July (completed before Montréal) ───
// { t: Wikipedia page title stem (before " – Men's singles"), s: surface, alt: [variants] }
const H = 'hard', C = 'clay', G = 'grass';
// Titles marked ✓ were confirmed to resolve from the 2026 ATP Tour season page. The
// rest carry alt-title variants (sponsor names differ year to year); the script tries
// each and cleanly skips any that 404. Surfaces are from the known 2026 calendar.
const EVENTS = [
  // — January hard —
  { t: '2026 Brisbane International', s: H },                              // ✓
  { t: '2026 ATP Hong Kong Tennis Open', s: H, alt: ['2026 Hong Kong Open', '2026 Bank of Communications Hong Kong Open'] },
  { t: '2026 Adelaide International', s: H },                              // ✓
  { t: '2026 ASB Classic', s: H },                                        // ✓
  { t: '2026 Australian Open', s: H, slam: true },                        // ✓
  // — Feb indoor/hard + Latin-America clay + Gulf hard —
  { t: '2026 Open Occitanie', s: H, alt: ['2026 Open Sud de France'] }, { t: '2026 Dallas Open', s: H },
  { t: '2026 ABN AMRO Open', s: H, alt: ['2026 Rotterdam Open', '2026 ABN AMRO World Tennis Tournament'] },
  { t: '2026 Argentina Open', s: C, alt: ['2026 Argentina Open (tennis)'] }, { t: '2026 Delray Beach Open', s: H }, { t: '2026 Rio Open', s: C },
  { t: '2026 Qatar ExxonMobil Open', s: H, alt: ['2026 Qatar Open', '2026 Doha Open'] }, { t: '2026 Chile Open', s: C },
  { t: '2026 Dubai Tennis Championships', s: H },                         // ✓
  { t: '2026 Mexican Open', s: H, alt: ['2026 Abierto Mexicano Telcel'] },
  // — March Masters 1000 (hard) —
  { t: '2026 BNP Paribas Open', s: H, alt: ['2026 Indian Wells Masters'] }, // ✓ (Indian Wells)
  { t: '2026 Miami Open', s: H },                                         // ✓
  // — April/May clay —
  { t: '2026 U.S. Men’s Clay Court Championships', s: C, alt: ["2026 U.S. Men's Clay Court Championships"] },
  { t: '2026 Grand Prix Hassan II', s: C },
  { t: '2026 Monte-Carlo Masters', s: C, alt: ['2026 Rolex Monte-Carlo Masters'] },
  { t: '2026 Barcelona Open Banc Sabadell', s: C, alt: ['2026 Barcelona Open', '2026 Barcelona Open (tennis)'] },
  { t: '2026 BMW Open', s: C, alt: ['2026 BMW Open (tennis)'] },
  { t: '2026 Mutua Madrid Open', s: C },                                  // ✓
  { t: '2026 Italian Open', s: C },                                       // ✓ (Rome)
  { t: '2026 Geneva Open', s: C }, { t: '2026 Hamburg Open', s: C },      // Hamburg ✓
  { t: '2026 French Open', s: C, slam: true },                           // ✓
  // — June/July grass —
  { t: '2026 BOSS Open', s: G, alt: ['2026 Stuttgart Open', '2026 Boss Open'] },
  { t: '2026 Libéma Open', s: G, alt: ['2026 Libema Open', '2026 ’s-Hertogenbosch Open'] }, // ✓
  { t: "2026 Queen's Club Championships", s: G, alt: ['2026 Cinch Championships'] }, // ✓
  { t: '2026 Terra Wortmann Open', s: G, alt: ['2026 Halle Open'] },     // Halle
  { t: '2026 Eastbourne Open', s: G, alt: ['2026 Eastbourne International'] }, // ✓
  { t: '2026 Mallorca Championships', s: G },
  { t: '2026 Wimbledon Championships', s: G, slam: true },               // ✓
  // — post-Wimbledon (July) clay + hard —
  { t: '2026 Swedish Open', s: C },                                       // ✓ (Båstad)
  { t: '2026 Swiss Open Gstaad', s: C, alt: ['2026 Swiss Open'] },
  { t: '2026 Croatia Open Umag', s: C, alt: ['2026 Croatia Open'] },
  { t: '2026 Los Cabos Open', s: H, alt: ['2026 Mifel Tennis Open', '2026 Abierto de Tenis Mifel'] },
  { t: '2026 Generali Open Kitzbühel', s: C, alt: ['2026 Austrian Open', '2026 Generali Open'] },
  { t: '2026 Mubadala Citi DC Open', s: H, alt: ['2026 Washington Open', '2026 Citi Open'] }, // ✓ (Washington)
  // — August hard: the Masters immediately before Cincinnati. Montréal is the single most
  //   relevant form input for a Cincinnati field (same surface, same players, days earlier),
  //   so it MUST be counted — it was missing while the list stopped at "before Montréal".
  { t: '2026 National Bank Open', s: H, alt: ['2026 Canadian Open (tennis)', '2026 Rogers Cup'] },
  // Cincinnati, finished 2026-08-24 - the LAST event before the US Open and the single most
  // relevant form input for a US Open field: same surface, same players, days earlier. Fils won
  // it. Missing it would price the US Open on form that stops a fortnight short.
  { t: '2026 Cincinnati Open', s: H, alt: ['2026 Western & Southern Open', '2026 Cincinnati Masters'] },
];

const pickEvents = () => ONLY === 'slams' ? EVENTS.filter((e) => e.slam) : EVENTS;

// Short codes + level for the per-tournament results panel.
const SHORT = {
  '2026 Australian Open': 'AO', '2026 French Open': 'RG', '2026 Wimbledon Championships': 'WIM',
  '2026 BNP Paribas Open': 'IW', '2026 Miami Open': 'MIA', '2026 Mutua Madrid Open': 'MAD', '2026 Italian Open': 'ROM',
  '2026 Monte-Carlo Masters': 'MC', '2026 Cincinnati Open': 'CIN', '2026 Dubai Tennis Championships': 'DUB', '2026 Brisbane International': 'BRI',
  '2026 Adelaide International': 'ADL', '2026 ASB Classic': 'AKL', '2026 Hamburg Open': 'HAM',
  "2026 Queen's Club Championships": 'QUE', '2026 Libéma Open': 'HER', '2026 Eastbourne Open': 'EAS',
  // NB: Båstad is BAD and Washington is WDC — NOT 'BAS'/'DC'. Those two codes already mean
  // Basel (week 43) and the Davis Cup finals (week 46) in players.ts TOUR_CALENDAR, and since
  // both sit past SEASON_CUTOFF_WEEK every Båstad/Washington result was being silently dropped
  // from the form strip (and Båstad drawn as a hard court instead of clay).
  '2026 Swedish Open': 'BAD', '2026 Mubadala Citi DC Open': 'WDC', '2026 Barcelona Open Banc Sabadell': 'BCN',
  '2026 National Bank Open': 'MTL',
  '2026 Terra Wortmann Open': 'HAL', '2026 Qatar ExxonMobil Open': 'DOH', '2026 ABN AMRO Open': 'ROT', '2026 Rio Open': 'RIO',
};
const M1000 = new Set(['2026 BNP Paribas Open', '2026 Miami Open', '2026 Mutua Madrid Open', '2026 Italian Open', '2026 Monte-Carlo Masters']);
const M500 = new Set(['2026 Dubai Tennis Championships', "2026 Queen's Club Championships", '2026 Mubadala Citi DC Open',
  '2026 Hamburg Open', '2026 Barcelona Open Banc Sabadell', '2026 Terra Wortmann Open', '2026 ABN AMRO Open',
  '2026 Rio Open', '2026 Qatar ExxonMobil Open']);
const shortFor = (e) => SHORT[e.t] || e.t.replace(/^2026 /, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
const levelOf = (e) => (e.slam ? 'G' : M1000.has(e.t) ? 'M1000' : M500.has(e.t) ? 'M500' : '250');
const displayName = (e) => e.t.replace(/^2026 /, '');
// Panel ordering: Slams, then M1000, then M500, then the rest.
const LEVEL_RANK = { G: 0, M1000: 1, M500: 2, 250: 3 };

const clean = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Strip Wikipedia disambiguators like "(tennis)" / "(Spanish player)" BEFORE reducing
// to a–z, so "João Fonseca (tennis)" and pool "Joao Fonseca" resolve to the same key.
const matchKey = (s) => clean(s).replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
const priceFor = (rank) => Math.max(4, Math.min(50, Math.round(52 * Math.pow(rank, -0.42))));

const API = 'https://en.wikipedia.org/w/api.php';
// Wikipedia throttles anonymous bursts hard. Be a good citizen: descriptive
// User-Agent, serial requests with a delay, and retry with backoff on failure.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADERS = { 'User-Agent': 'GrandSlamGM-stats/1.0 (fantasy tennis app; contact: martinoarmanini@gmail.com)' };
async function fetchWikitext(title) {
  const url = `${API}?action=parse&prop=wikitext&formatversion=2&format=json&page=${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return { missing: true };           // page truly doesn't exist
      if (res.status === 429 || res.status >= 500) { await sleep(800 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      const j = await res.json();
      if (j.error) return j.error.code === 'missingtitle' ? { missing: true } : null;
      return { wikitext: j.parse?.wikitext ?? null };
    } catch { await sleep(600 * (attempt + 1)); }
  }
  return null; // exhausted retries (throttled/network) — distinct from missing
}
// try the main title then any alternates, each with the " – Men's singles" suffix.
// Returns { wikitext } | { missing:true } (all variants 404) | { throttled:true }.
async function fetchEvent(e) {
  let sawThrottle = false;
  // Wikipedia does not name these pages consistently. Slams and the big Masters use
  // "<event> – Men's singles"; ATP 250/500 events and Monte-Carlo use "<event> – Singles";
  // a few season articles carry the draw inline. Try all three before calling an event missing —
  // assuming ONE convention is what left a whole season silently unread.
  for (const stem of [e.t, ...(e.alt || [])]) {
    for (const title of [`${stem} – Men's singles`, `${stem} – Singles`, stem]) {
      const r = await fetchWikitext(title);
      if (r === null) { sawThrottle = true; continue; }
      if (r.wikitext) return { wikitext: r.wikitext };
      // r.missing → try the next shape
    }
  }
  return sawThrottle ? { throttled: true } : { missing: true };
}

// Extract balanced {{...}} template blocks whose name matches /TeamBracket/.
function bracketBlocks(w) {
  const blocks = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] === '{' && w[i + 1] === '{') {
      // read template name
      const name = w.slice(i + 2, i + 40);
      if (/^[^|}]*TeamBracket/.test(name)) {
        // find balanced close
        let depth = 0, j = i;
        for (; j < w.length; j++) {
          if (w[j] === '{' && w[j + 1] === '{') { depth++; j++; }
          else if (w[j] === '}' && w[j + 1] === '}') { depth--; j++; if (depth === 0) break; }
        }
        blocks.push(w.slice(i, j + 1));
        i = j;
      }
    }
  }
  return blocks;
}

const nameFrom = (v) => { const m = (v || '').match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/); return m ? m[1].trim() : null; };
const isBold = (v) => /'''/.test(v || '');

// Bracket round label → result code (the round a player LOST in = how far they got).
// Check semi/quarter before "final" (they contain the substring "final").
function roundToResult(label) {
  const l = (label || '').toLowerCase();
  if (/semi-?final/.test(l)) return 'SF';
  if (/quarter-?final/.test(l)) return 'QF';
  if (/\bfinal\b/.test(l)) return 'F';
  if (/fourth round|round of 16/.test(l)) return 'R16';
  if (/third round|round of 32/.test(l)) return 'R32';
  if (/second round|round of 64/.test(l)) return 'R64';
  if (/first round|round of 128/.test(l)) return 'R128';
  return null;
}

// From one bracket block → list of {winner, loser, round}. Winner = bolded side of a
// pairing; round = that column's RD label mapped to a result code. Slot numbers may be
// zero-padded (team01…team16) or plain (team1…team8); we pair by sorted slot.
function bracketMatches(block) {
  const labels = {}; // rd -> label
  let lm; const lre = /\|\s*RD(\d+)\s*=\s*([^\n|]+)/g;
  while ((lm = lre.exec(block))) labels[lm[1]] = lm[2].trim();
  const perRound = {}; // rd -> [{ slot, val }]
  const re = /\|\s*RD(\d+)-team(\d+)\s*=\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(block))) (perRound[m[1]] ??= []).push({ slot: +m[2], val: m[3] });
  const out = [];
  for (const rd of Object.keys(perRound)) {
    const arr = perRound[rd].sort((a, b) => a.slot - b.slot);
    const round = roundToResult(labels[rd]);
    for (let i = 0; i + 1 < arr.length; i += 2) {
      const a = arr[i].val, b = arr[i + 1].val;
      const na = nameFrom(a), nb = nameFrom(b);
      if (!na || !nb) continue; // bye / qualifier-TBD
      const aw = isBold(a), bw = isBold(b);
      if (aw === bw) continue; // undetermined / both or neither bold → skip
      out.push(aw ? { winner: na, loser: nb, round } : { winner: nb, loser: na, round });
    }
  }
  return out;
}

function championOf(w) {
  const m = w.match(/\|\s*champ\s*=\s*([^\n]*)/);
  return m ? nameFrom(m[1]) : null;
}

async function main() {
  const pool = JSON.parse(readFileSync(POOL_PATH, 'utf8'));
  const events = pickEvents();
  console.log(`Aggregating 2026 YTD form from ${events.length} Wikipedia event pages…\n`);

  // Below this many matches a surface record says more about scheduling than about the player, so
  // the overall season stands in. Four is deliberately low: it keeps a real clay specialist's clay
  // number while refusing to price anyone off a single result.
  const MIN_SURFACE = 4;
  const stat = new Map(); // key -> {w,l,titles,surf:{hard,clay,grass:{w,l}}}
  const blank = () => ({ w: 0, l: 0, titles: 0, surf: { hard: { w: 0, l: 0 }, clay: { w: 0, l: 0 }, grass: { w: 0, l: 0 } } });
  const bump = (name, won, surf) => {
    const k = matchKey(name); if (!k) return;
    const s = stat.get(k) ?? blank();
    if (won) s.w++; else s.l++;
    if (surf) { if (won) s.surf[surf].w++; else s.surf[surf].l++; }
    stat.set(k, s);
  };

  const results = new Map(); // playerKey -> [{ tournament, short, surface, result, lvl }]
  const found = [], missing = [], throttled = [];
  for (const e of events) {
    const r = await fetchEvent(e);
    await sleep(350); // pace requests — be kind to the API, avoid throttling
    if (r.throttled) { throttled.push(e.t); console.log(`  … ${e.t} (throttled — rerun to pick up)`); continue; }
    if (r.missing) { missing.push(e.t); console.log(`  ✗ ${e.t} (no such page — fix title)`); continue; }
    const w = r.wikitext;
    const seen = new Set();
    const lostRound = new Map(); // playerKey -> result code of the round they lost in
    let n = 0;
    for (const blk of bracketBlocks(w)) {
      for (const mt of bracketMatches(blk)) {
        const pair = [matchKey(mt.winner), matchKey(mt.loser)].sort().join('|');
        if (seen.has(pair)) continue; // dedupe overlap (section vs finals bracket)
        seen.add(pair);
        bump(mt.winner, true, e.s); bump(mt.loser, false, e.s); n++;
        if (mt.round) lostRound.set(matchKey(mt.loser), mt.round); // one loss/event → their result
      }
    }
    const champ = championOf(w);
    if (champ) { const s = stat.get(matchKey(champ)); if (s) s.titles++; lostRound.set(matchKey(champ), 'W'); }
    // record each player's result at this event for the per-tournament panel
    const meta = { tournament: displayName(e), short: shortFor(e), surface: e.s, lvl: levelOf(e) };
    for (const [k, result] of lostRound) {
      if (!result) continue;
      (results.get(k) ?? results.set(k, []).get(k)).push({ ...meta, result });
    }
    found.push(e.t);
    console.log(`  ✓ ${e.t.padEnd(42)} ${n} matches${champ ? `, champ ${champ}` : ''}`);
  }

  // merge into pool: 2026 YTD stats where we have them; keep current rank/price
  const pct = (w, l) => (w + l ? Math.round((100 * w) / (w + l)) : null);
  const surfacePct = (st) => {
    const overall = pct(st.w, st.l);
    const thinSeason = st.w + st.l < MIN_SURFACE;
    const one = (k) => {
      const { w, l } = st.surf[k];
      if (w + l >= MIN_SURFACE) return pct(w, l);        // his own record on this surface
      if (thinSeason) return 50;                          // nothing is known — stay neutral
      return overall;                                     // his season stands in for the surface
    };
    return { hard: one('hard'), clay: one('clay'), grass: one('grass') };
  };
  // The evidence behind each percentage: the wins-losses actually played on that surface, and
  // whether the figure is that surface's own record or the overall season standing in for it.
  // Without this the pool cannot tell "76% on hard, 13-4" from "76% season, two hard matches".
  const surfaceRecord = (st) => {
    const out = {};
    for (const k of ['hard', 'clay', 'grass']) {
      const { w, l } = st.surf[k];
      out[k] = { w, l, real: w + l >= MIN_SURFACE };
    }
    return out;
  };
  let enriched = 0; const noData = [];
  const out = pool.map((p) => {
    const base = { ...p, price: priceFor(p.rank) };
    const st = stat.get(matchKey(p.name));
    if (!st || st.w + st.l === 0) {
      // no 2026 tour-level data → keep whatever form the pool already had, labelled with
      // its season so a 2025 fallback is never mistaken for current form (null → no label).
      noData.push(p.name);
      const keep = base.ytd ?? null;
      return { ...base, surface: base.surface ?? null, ytd: keep, statsYear: keep ? (base.statsYear ?? 2025) : undefined };
    }
    enriched++;
    // per-tournament results, biggest events first, capped so the panel stays readable
    const rs = (results.get(matchKey(p.name)) ?? [])
      .sort((a, b) => LEVEL_RANK[a.lvl] - LEVEL_RANK[b.lvl])
      .slice(0, 10)
      .map(({ tournament, surface, short, result }) => ({ tournament, surface, short, result }));
    return { ...base, surface: surfacePct(st), surfaceRecord: surfaceRecord(st), ytd: { wins: st.w, losses: st.l, titles: st.titles }, statsYear: 2026, results2026: rs };
  });

  console.log(`\n── report ──────────────────────────────────────────`);
  console.log(`events found: ${found.length}/${events.length}   missing-title: ${missing.length}   throttled: ${throttled.length}`);
  if (missing.length) console.log('  bad title → ' + missing.join(', '));
  if (throttled.length) console.log('  throttled (rerun) → ' + throttled.join(', '));
  console.log(`players with 2026 data: ${enriched}/${pool.length}`);
  for (const id of ['sinner', 'alcaraz', 'zverev', 'fonseca', 'draper']) {
    const p = out.find((x) => x.id === id);
    if (p) console.log(`  ${p.name.padEnd(20)} rank ${String(p.rank).padStart(3)} $${p.price}M  2026 ${p.ytd ? `${p.ytd.wins}-${p.ytd.losses} (${p.ytd.titles}t)` : '—'}  ${p.surface ? JSON.stringify(p.surface) : ''}`);
  }
  if (DRY) { console.log('\n--dry: nothing written.'); return; }
  writeFileSync(POOL_PATH + '.bak', JSON.stringify(pool, null, 0) + '\n');
  writeFileSync(POOL_PATH, JSON.stringify(out, null, 0) + '\n');
  console.log(`\nWrote ${POOL_PATH} (backup: atp300.json.bak).`);
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; });
