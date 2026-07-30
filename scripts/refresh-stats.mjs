// Refresh the 300-player pool with REAL match-derived stats.
// ─────────────────────────────────────────────────────────────────────────────
//   node scripts/refresh-stats.mjs                    # season 2025 (default)
//   node scripts/refresh-stats.mjs --season=2026      # a whole calendar year
//   node scripts/refresh-stats.mjs --date=2026-07-28 --window=365   # trailing window
//   node scripts/refresh-stats.mjs --dry              # compute + report, write nothing
//
// Source: Tennismylife/TML-Database (github.com/Tennismylife/TML-Database) — a live,
// open ATP match database in Jeff Sackmann's column format. Fetched via the jsDelivr
// CDN, so it works from anywhere (no GitHub auth, no branch guessing). Jeff Sackmann's
// original tennis_atp repo was removed in 2026; this is the maintained stand-in.
//
// NOTE on freshness: as of this writing TML has merged results only through mid-Jan
// 2026, so the most recent COMPLETE real season is 2025 — hence the default. Rerun
// with --season=2026 (or a trailing --window) once TML catches up, or before the
// US Open, to fold in 2026 form.
//
// What it does: keeps every identity in src/data/atp300.json (id, ATP photo, flag,
// country) AND its current rank (already a July-2026 snapshot — the freshest rank we
// have), then joins to TML by name and adds, over the chosen span: W/L, titles
// (tour-level finals won, team events excluded), and hard/clay/grass win% — plus
// hand and current age. Price is derived from the current rank via the app's exact
// priceFor curve. Stats are never fabricated: no data in the span → null + a report.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const POOL_PATH = join(root, 'src/data/atp300.json');

// ── args ─────────────────────────────────────────────────────────────────────
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const DRY = process.argv.includes('--dry');
const SEASON = arg('season', process.argv.some((a) => a.startsWith('--date=') || a.startsWith('--window=')) ? '' : '2025');
const WINDOW_DAYS = Number(arg('window', '365'));
const endDate = arg('date', '') ? new Date(arg('date', '')) : new Date();
if (Number.isNaN(endDate.getTime())) throw new Error('bad --date (use YYYY-MM-DD)');
const startDate = new Date(endDate.getTime() - WINDOW_DAYS * 864e5);
const ymd = (d) => d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
const START = ymd(startDate);
const END = ymd(endDate);
const today = new Date();

// ── pricing: identical curve to src/data/players.ts priceFor() ───────────────
const priceFor = (rank) => Math.max(4, Math.min(50, Math.round(52 * Math.pow(rank, -0.42))));

// ── name join key: strip accents, keep a–z only ─────────────────────────────
const clean = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matchKey = (s) => clean(s).replace(/[^a-z]/g, '');

// ── CSV parser (handles quoted fields) ───────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const CDN = 'https://cdn.jsdelivr.net/gh/Tennismylife/TML-Database';
async function fetchYear(year) {
  const url = `${CDN}/${year}.csv`;
  let res;
  try { res = await fetch(url); } catch (e) { throw new Error(`GET ${url} → ${e.message} (offline?)`); }
  if (res.status === 404) return null; // year not in the DB — skip, non-fatal
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const norm = (s) => (s === 'Grass' ? 'grass' : s === 'Clay' ? 'clay' : s === 'Hard' ? 'hard' : null);
const isTeamEvent = (name) => /\b(united cup|davis cup|laver cup|atp cup|hopman)\b/i.test(name || '');

async function main() {
  const pool = JSON.parse(readFileSync(POOL_PATH, 'utf8'));
  const years = SEASON ? [Number(SEASON)]
    : Array.from({ length: startDate.getUTCFullYear() <= endDate.getUTCFullYear() ? endDate.getUTCFullYear() - startDate.getUTCFullYear() + 1 : 1 },
        (_, i) => startDate.getUTCFullYear() + i);
  console.log(`Span: ${SEASON ? `${SEASON} season (whole year)` : `${START}…${END} (${WINDOW_DAYS}d)`}`);
  console.log(`Pool: ${pool.length} players. Fetching TML years: ${years.join(', ')}`);

  // tally per normalized-name (TML is keyed by name; ids differ from the ATP codes)
  const blank = () => ({ w: 0, l: 0, titles: 0, hand: '', age: null, ageDate: 0,
    surf: { hard: { w: 0, l: 0 }, clay: { w: 0, l: 0 }, grass: { w: 0, l: 0 } } });
  const stat = new Map();
  const bump = (name, hand, ageStr, date, won, surf, isFinalWin) => {
    const k = matchKey(name);
    if (!k) return;
    const s = stat.get(k) ?? blank();
    if (won) s.w++; else s.l++;
    if (surf) { if (won) s.surf[surf].w++; else s.surf[surf].l++; }
    if (isFinalWin) s.titles++;
    if (hand && !s.hand) s.hand = hand.toUpperCase();
    const age = parseFloat(ageStr);
    if (!Number.isNaN(age) && date > s.ageDate) { s.age = age; s.ageDate = date; } // latest observed age
    stat.set(k, s);
  };

  let matchCount = 0;
  for (const y of years) {
    const rows = await fetchYear(y);
    if (!rows) { console.log(`${y}.csv: (not in DB, skipped)`); continue; }
    let used = 0;
    for (const m of rows) {
      const d = Number(m.tourney_date);
      if (!SEASON && !(d >= START && d <= END)) continue;
      used++; matchCount++;
      const surf = norm(m.surface);
      const finalWin = m.round === 'F' && !isTeamEvent(m.tourney_name);
      bump(m.winner_name, m.winner_hand, m.winner_age, d, true, surf, finalWin);
      bump(m.loser_name, m.loser_hand, m.loser_age, d, false, surf, false);
    }
    console.log(`${y}.csv: ${rows.length} rows, ${used} in span`);
  }
  console.log(`Total matches counted: ${matchCount}`);

  // surface%: real per-surface rate with ≥4 matches, else overall, else null
  const pct = (w, l) => (w + l ? Math.round((100 * w) / (w + l)) : null);
  const surfacePct = (st) => {
    const overall = pct(st.w, st.l);
    const one = (k) => { const { w, l } = st.surf[k]; return w + l >= 4 ? pct(w, l) : overall; };
    return { hard: one('hard'), clay: one('clay'), grass: one('grass') };
  };
  const MS_PER_YEAR = 365.25 * 864e5;
  const ageToday = (st) => {
    if (st.age == null) return null;
    const d = st.ageDate; // YYYYMMDD of the latest match where we observed the age
    const matchMs = Date.UTC(Math.floor(d / 1e4), (Math.floor(d / 100) % 100) - 1, d % 100);
    return Math.round(st.age + (today.getTime() - matchMs) / MS_PER_YEAR);
  };

  // join pool (keep identity + CURRENT rank) → add stats
  let enrichedCount = 0;
  const noStats = [];
  const out = pool.map((p) => {
    const base = { ...p, price: priceFor(p.rank) };
    const st = stat.get(matchKey(p.name));
    if (!st || st.w + st.l === 0) { noStats.push(p.name); return { ...base, hand: base.hand, surface: null, ytd: null }; }
    enrichedCount++;
    return {
      ...base,
      hand: st.hand === 'L' ? 'L' : 'R',
      age: ageToday(st),
      surface: surfacePct(st),
      ytd: { wins: st.w, losses: st.l, titles: st.titles },
      // Label the season so the UI never shows this (2025 by default) as current-year
      // form. Consumers treat an unlabeled ytd as current — see players.ts / PlayerPage.
      statsYear: SEASON ? Number(SEASON) : endDate.getUTCFullYear(),
      // Drop any per-tournament results carried from a prior build-2026 run — they'd be
      // 2026 data under a 2025 label (a year desync). This script doesn't produce them.
      results2026: undefined,
    };
  });

  console.log(`\n── report ──────────────────────────────────────────`);
  console.log(`enriched with real stats : ${enrichedCount}/${pool.length}`);
  console.log(`identity-only (no data)  : ${noStats.length}`);
  if (noStats.length) console.log('  ' + noStats.slice(0, 40).join(', ') + (noStats.length > 40 ? ` … (+${noStats.length - 40})` : ''));
  const sinner = out.find((p) => p.id === 'sinner');
  if (sinner) console.log(`\nspot-check ${sinner.name}: rank ${sinner.rank}, $${sinner.price}M, ytd`, sinner.ytd, 'surface', sinner.surface);

  if (DRY) { console.log('\n--dry: nothing written.'); return; }
  writeFileSync(POOL_PATH + '.bak', JSON.stringify(pool, null, 0) + '\n');
  writeFileSync(POOL_PATH, JSON.stringify(out, null, 0) + '\n');
  console.log(`\nWrote ${POOL_PATH} (backup: atp300.json.bak).`);
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; });
