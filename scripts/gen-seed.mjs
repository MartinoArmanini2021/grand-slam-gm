// ── Generate a tournament's player_stats seed (id, ranking, price, tier) ─────────────────────────
// WHY ALL FOUR COLUMNS: save_entry validates the TIER QUOTA off player_stats.tier and the BUDGET off
// .price, and recompute-score reads .ranking for the upset multiplier. A row carrying only `ranking`
// leaves tier/price NULL — the quota check then reads a legal 2/3/5 squad as 2/3/4 (so it can never
// be locked) and sum(price) silently under-counts the budget. This bit us at the Cincinnati cutover:
// 14 entrants incl. Djokovic and Draper would have been impossible to lock into a squad.
//
//   node scripts/gen-seed.mjs cincinnati_2026            # write the seed
//   node scripts/gen-seed.mjs cincinnati_2026 --check    # verify only; non-zero exit if stale
//
// RULE 2 OF THE RUNBOOK — prices and tiers are NEVER re-applied once published. They are what managers
// drafted against; re-applying them reprices squads that are already locked. So the upsert this file
// emits depends on the event's `status` in scripts/lib/events.mjs:
//   upcoming  → on conflict, update ranking, price AND tier (nobody has drafted yet)
//   live      → on conflict, update RANKING ONLY. A player with no row yet (a lucky loser, a late
//   completed   entrant) still gets a full row, which reprices nobody. Existing price/tier: untouched.
// A missing status is an error, not a default: the next event has to say which it is.
// One more rule: a seed that was applied and then embedded verbatim in an applied migration is
// HISTORY and is not regenerated — Cincinnati's lives inside apply_step2_step3_atomic.sql, and
// src/__tests__/atomicApplyFile.test.ts fails the moment the two differ. `--check` on such an
// event reports "out of date" against today's template; that is expected, leave the file alone.
//
// player_stats is ONE table shared by every event, so the generator CROSS-CHECKS: any player this
// event shares with an already-written seed is reported when rank/price/tier differ. Since fix 1.3
// the table is keyed (tournament_id, id), so a difference is expected (each event owns its rows)
// and is printed for eyeballing, never treated as an error.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { EVENTS, getEvent } from './lib/events.mjs';
import { tierOf, priceOf } from './lib/pricing.mjs';

const [id, ...flags] = process.argv.slice(2);
if (!id) { console.error('usage: node scripts/gen-seed.mjs <event-id> [--check]'); process.exit(2); }
const CHECK = flags.includes('--check');
const ev = getEvent(id);
const root = new URL('../', import.meta.url);

const STATUSES = ['upcoming', 'live', 'completed'];
if (!STATUSES.includes(ev.status)) {
  console.error(`scripts/lib/events.mjs must declare status for ${id}: one of ${STATUSES.join(' | ')} (got ${JSON.stringify(ev.status)})`);
  process.exit(2);
}
// Published = managers can, or once could, draft against these prices. From that moment on, price
// and tier are frozen for every existing row.
const published = ev.status !== 'upcoming';

const field = JSON.parse(readFileSync(new URL(ev.field, root), 'utf8'));
const rows = field.map(p => ({
  id: p.id,
  ranking: p.ranking,
  price: priceOf(p.ranking, p.ytd, p.surface?.[ev.surface]),
  tier: tierOf(p.ranking),
})).sort((a, b) => a.ranking - b.ranking);

// ── Cross-check against every OTHER seed already in the repo ─────────────────────────────────────
const others = [
  // save_entry_rpc.sql used to be listed here — it carried an embedded 77-row seed. That block is
  // gone (it held 7 players who are not in the Cincinnati draw); seeds now live only in their own
  // per-event files, which is the only place this cross-check should ever have been reading.
  ...Object.entries(EVENTS).filter(([k]) => k !== id).map(([, e]) => e.seed),
];
const seen = new Map();   // id → { ranking, price, tier, from }
for (const rel of others) {
  const url = new URL(rel, root);
  if (!existsSync(url)) continue;
  const sql = readFileSync(url, 'utf8');
  for (const m of sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(\w+)'\s*\)/g)) {
    if (!seen.has(m[1])) seen.set(m[1], { ranking: +m[2], price: +m[3], tier: m[4], from: rel });
  }
}
const clashes = rows.filter(r => {
  const o = seen.get(r.id);
  return o && (o.ranking !== r.ranking || o.price !== r.price || o.tier !== r.tier);
});
const shared = rows.filter(r => seen.has(r.id)).length;

console.log(`\n  event:            ${id} — ${ev.label} (${ev.status})`);
console.log(`  field:            ${rows.length} players`);
console.log(`  shared with existing seeds: ${shared}   mismatches: ${clashes.length}`);
for (const c of clashes) {
  const o = seen.get(c.id);
  console.log(`    ✗ ${c.id}: ${o.from} has rank ${o.ranking} $${o.price} ${o.tier} — this event says ${c.ranking} $${c.price} ${c.tier}`);
}
// NOT an error since fix 1.3. player_stats is keyed (tournament_id, id), so each event owns its own
// rows: a differing rank or price just means the player moved between tournaments, which is exactly
// what scoping exists to record. Reported for eyeballing. It used to exit 1 because, with one shared
// table, a clash would have silently rewritten a finished event's scores.
if (clashes.length) {
  console.log(`
  note: ${clashes.length} player(s) differ from an earlier seed — expected; each event keeps its own row.
`);
}

// Wrap a long note into "-- " comment lines so the header stays readable.
const comment = (text, width = 96) => {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(line);
  return out.map(l => `-- ${l}`).join('\n');
};

{
  const body = rows.map(r => `  ('${id}', '${r.id}', ${r.ranking}, ${r.price}, '${r.tier}')`).join(',\n');
  // The header says only what this generator can actually vouch for. Whether the field matches the
  // published draw is reconcile-field's verdict, recorded per event in events.mjs — not a claim
  // this template makes on its own (it used to print "0 missing, 0 phantom" for every event).
  const reconciled = ev.reconciled
    ? comment(`Reconciliation, as recorded in scripts/lib/events.mjs: ${ev.reconciled}`)
    : comment('Reconciliation: not recorded for this event. This header proves NOTHING about the draw — run '
      + "scripts/reconcile-field.mjs and record its verdict in scripts/lib/events.mjs (reconciled: '…').");
  const applyNote = published
    ? comment(`PUBLISHED EVENT (status: ${ev.status}). Runbook rule 2: prices and tiers are never re-applied once `
      + 'managers have drafted against them. The upsert below refreshes RANKING ONLY on an existing row (the '
      + 'upset multiplier reads it) and leaves price and tier exactly as they were locked. A player with no '
      + 'row yet (a lucky loser, a late entrant) gets a full row — adding one row reprices nobody. The price and '
      + "tier VALUES in this file are the generator's computation from today's field data and can differ from "
      + 'what production locked; the archive snapshot is the record of what was actually played.')
    : comment('UPCOMING EVENT. Apply before the market opens for it. Re-running while the event is still marked '
      + 'upcoming in scripts/lib/events.mjs rewrites all four columns, which is fine until managers can draft. '
      + "The moment they can, set status: 'live' there — from then on gen-seed never re-applies price or tier "
      + '(runbook rule 2: what managers drafted against stays).');
  const conflict = published
    ? 'on conflict (tournament_id, id) do update set ranking = excluded.ranking;  -- published: price and tier are never re-applied'
    : 'on conflict (tournament_id, id) do update set ranking = excluded.ranking, price = excluded.price, tier = excluded.tier;';
  const sql = `-- ── ${ev.label} — player_stats seed for server-side validation + scoring ────────────────
-- WHY ALL FOUR COLUMNS: save_entry validates the TIER QUOTA off player_stats.tier and the BUDGET off
-- .price, and recompute-score reads .ranking for the upset multiplier. A row carrying only \`ranking\`
-- leaves tier/price NULL — the quota check then reads a legal 2/3/5 squad as 2/3/4 (so it can never
-- be locked) and sum(price) silently under-counts the budget. Every drafted player needs all four.
--
-- Generated by scripts/gen-seed.mjs from ${ev.field}: every player in that file, ${rows.length} rows,
-- ${shared} of them also in another event's seed (differences there are expected — each event owns its rows).
${reconciled}
--
${applyNote}
--
-- Regenerate with:  node scripts/gen-seed.mjs ${id}

insert into public.player_stats (tournament_id, id, ranking, price, tier) values
${body}
${conflict}

-- Verify: every entrant has a COMPLETE row (a NULL price or tier is the bug described above).
-- select count(*) filter (where price is not null and tier is not null) as complete,
--        count(*) filter (where price is null or tier is null)         as broken
--   from public.player_stats;
`;
  const out = new URL(ev.seed, root);
  if (CHECK) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if (current.trim() !== sql.trim()) { console.error(`\n  ✗ ${ev.seed} is out of date — re-run without --check\n`); process.exitCode = 1; }
    else console.log(`\n  ✓ ${ev.seed} is up to date\n`);
  } else {
    writeFileSync(out, sql);
    console.log(`\n  ✓ wrote ${rows.length} rows → ${ev.seed}`);
    console.log(published
      ? `    (${ev.status}: the upsert refreshes ranking only — price and tier are never re-applied; new players get full rows)\n`
      : `    (upcoming: the upsert applies ranking, price and tier — set status: 'live' in events.mjs the moment managers can draft)\n`);
  }
}
