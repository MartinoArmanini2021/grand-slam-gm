// ── Daily live data-flow verifier ────────────────────────────────────────────
// Checks the LIVE system end-to-end, three independent ways, and exits non-zero on ANY problem.
// The whole point: catch what fixture tests can't — a real, partially-played draw evolving over
// time, and whether the DB actually reflects it. It NEVER trusts the app parser as ground truth:
// it re-derives each winner straight from the wikitext (bold + advancement) so a PARSER bug is
// caught too, then compares Wikipedia-truth ↔ app-parser ↔ live public.matches ↔ ingest health.
//
//   node scripts/verify-app.mjs [tournamentId]
//
// tournamentId is optional — defaults to app_config.active_tournament_id (same source of truth
// ingest-draw and recompute-score use), so this always checks whichever event is actually live.
// Pass one explicitly to check a specific tournament by hand, e.g. a just-finished event.
//
// Exit 0 = all green. Exit 1 = a correctness problem (details printed). Exit 2 = couldn't run
// (network/source/unresolved tournament). Runs on a schedule via GitHub Actions
// (.github/workflows/verify-live-data.yml) and by hand anytime.
//
// KNOWN FAILURE MODE (flagged 2026-09-01): in a sandboxed Claude Code cloud environment, this
// script needs outbound HTTPS to en.wikipedia.org and to the Supabase project host
// (mrdmlfumdsxufifjulbt.supabase.co). If the environment's egress policy doesn't allow those two
// hosts, both fetches fail with a 403 on the CONNECT tunnel and this script exits 2 with
// `Unexpected token 'H', "Host not i"... is not valid JSON` — that is an environment/network-policy
// block, NOT evidence the live results feed is broken. Confirm with `curl -v` to the two hosts above
// (a 403 CONNECT means policy, not the app) before treating an exit-2 here as a live-data bug. Fix by
// allowlisting both hosts in the environment's network policy (see
// https://code.claude.com/docs/en/claude-code-on-the-web) — nothing in this repo can work around it.

import { readFileSync } from 'node:fs';
import { buildResolver, splitBrackets, parseFullDraw, buildMatchRows } from '../src/data/drawParser.ts';

// Public, RLS-guarded anon key (same one that ships in every browser) — read-only, no secrets.
const SUPA = 'https://mrdmlfumdsxufifjulbt.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZG1sZnVtZHN4dWZpZmp1bGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzU1NTQsImV4cCI6MjEwMDc1MTU1NH0.5SKW9HXQ1rGNUyH1hdgX_esoEYVYK4qPcuRtYgaCdKQ';

// Per-tournament Wikipedia page + draftable field. MUST mirror the ingest-draw edge function's own
// TOURNAMENTS registry (supabase/functions/ingest-draw/index.ts) — same page names — so what this
// verifies is exactly what ingest-draw itself pulls from Wikipedia. Add an entry here whenever one
// is added there. (Fixed 2026-09-01: this used to hardcode montreal_2026/its field below, which
// silently kept re-verifying that event forever after it finished — cincinnati_2026 went live with
// zero live-data coverage. NO HARDCODED TOURNAMENT: see TID resolution in main().)
const TOURNAMENTS = {
  montreal_2026: { page: "2026 National Bank Open – Men's singles", field: 'montreal2026Field.json' },
  cincinnati_2026: { page: "2026 Cincinnati Open – Men's singles", field: 'cincinnati2026Field.json' },
};

const SCORED = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const SECTION_ROUNDS = ['R128', 'R64', 'R32', 'R16'];
const FINALS_ROUNDS = ['QF', 'SF', 'F'];
const FRESH_MIN = 20; // ingest cron runs every 5 min → stale if no successful run within this window

const fail = [], warn = [], ok = [];
const F = (m) => fail.push(m); const W = (m) => warn.push(m); const OK = (m) => ok.push(m);

const pk = (a, b) => [a, b].sort().join(' vs ');
const rest = async (path) => {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) throw new Error(`REST ${path} → ${r.status}`);
  return r.json();
};

// Set process.exitCode (never process.exit) and let the loop drain — on Windows/Node, exiting
// while an undici fetch socket is still open trips a libuv assertion that masks the exit code.
async function main() {
  // ── which tournament: an explicit CLI arg for a manual/local run, else app_config.active_-
  // tournament_id — the SAME single source of truth ingest-draw and recompute-score resolve from
  // (see supabase/functions/recompute-score/index.ts). No hardcoded fallback: this script exists
  // to prove the LIVE tournament's data flow is correct, so silently checking the wrong one (or a
  // finished one) would be worse than refusing to run.
  const TID = process.argv[2] || (await rest('app_config?key=eq.active_tournament_id&select=value'))[0]?.value;
  if (!TID) { console.error('could not resolve a tournament: no CLI arg and app_config.active_tournament_id is unset or unreadable.'); process.exitCode = 2; return; }
  const cfg = TOURNAMENTS[TID];
  if (!cfg) { console.error(`no Wikipedia page/field registered for "${TID}" (know: ${Object.keys(TOURNAMENTS).join(', ')}) — add it to TOURNAMENTS above and redeploy before switching app_config.active_tournament_id.`); process.exitCode = 2; return; }
  const { page: PAGE, field: fieldFile } = cfg;

  const field = JSON.parse(readFileSync(new URL(`../src/data/${fieldFile}`, import.meta.url), 'utf8'));
  const nameById = new Map(field.map((p) => [p.id, p.name]));
  const resolve = buildResolver(field);
  const nm = (id) => id == null ? '—' : id === 'tbd' ? 'TBD' : (nameById.get(id) ?? id.replace(/^x_/, '').replace(/_/g, ' '));

  // ── fetch the three views ──
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE)}&prop=wikitext&formatversion=2&format=json&origin=*`;
  const wikitext = (await (await fetch(wikiUrl)).json())?.parse?.wikitext;
  if (typeof wikitext !== 'string') { console.error('could not load the draw page'); process.exitCode = 2; return; }
  const dbRows = await rest(`matches?tournament_id=eq.${TID}&select=round,slot,p1_id,p2_id,winner_id`);
  const health = (await rest(`ingest_health?tournament_id=eq.${TID}&select=*`))[0];

  // ── (T) INDEPENDENT truth: winner from bold + advancement, per player-pair, per round ──
  const label = (raw) => raw.replace(/\{\{[^}]*\}\}/g, ' ').replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/[{}[\]|]/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const truth = Object.fromEntries(SCORED.map((r) => [r, new Map()]));
  const extract = (text, roundIds) => {
    const team = {}, bold = {};
    for (const m of text.matchAll(/\|\s*RD(\d+)-team(\d+)\s*=\s*(.*?)(?=\s*\|\s*RD|\n\s*\||\n\}\}|$)/gm)) {
      const rd = +m[1], idx = +m[2] - 1, raw = m[3]; if (!label(raw)) continue;
      (team[rd] ??= {})[idx] = raw; (bold[rd] ??= {})[idx] = /'''/.test(raw);
    }
    for (let rd = 1; rd <= roundIds.length; rd++) {
      const rid = roundIds[rd - 1]; if (!SCORED.includes(rid)) continue;
      const t = team[rd] ?? {}, nx = team[rd + 1] ?? {};
      const maxIdx = Math.max(-1, ...Object.keys(t).map(Number));
      for (let s = 0; s <= Math.floor(maxIdx / 2); s++) {
        const aRaw = t[s * 2], bRaw = t[s * 2 + 1]; if (aRaw == null || bRaw == null) continue;
        const aId = resolve(aRaw), bId = resolve(bRaw);
        const aB = bold[rd]?.[s * 2] ?? false, bB = bold[rd]?.[s * 2 + 1] ?? false;
        const byBold = aB && !bB ? aId : bB && !aB ? bId : null;
        const adv = nx[s] != null ? resolve(nx[s]) : null;
        const byAdv = adv === aId ? aId : adv === bId ? bId : null;
        truth[rid].set(pk(aId, bId), { aId, bId, byBold, byAdv });
      }
    }
  };
  const brackets = splitBrackets(wikitext).filter((b) => /TeamBracket/i.test(b.type) && !/^2TeamBracket/i.test(b.type));
  for (const s of brackets.filter((b) => /^16TeamBracket/i.test(b.type))) extract(s.text, SECTION_ROUNDS);
  const finals = brackets.find((b) => /^8TeamBracket/i.test(b.type)); if (finals) extract(finals.text, FINALS_ROUNDS);

  // ── (P) app parser (ingest mode) & (D) DB, both keyed by player-pair ──
  const parsed = parseFullDraw(wikitext, { scoredRounds: SCORED, resolve });
  const parsedWin = new Map(); for (const m of parsed.draw) { const w = parsed.results[`${m.round}_${m.slot}`]; if (w) parsedWin.set(pk(m.p1Id, m.p2Id), w); }
  const dbWin = new Map(), dbPairSet = new Set(), dbBySlot = new Map();
  for (const r of dbRows) { const k = pk(r.p1_id, r.p2_id); dbPairSet.add(k); dbBySlot.set(`${r.round}_${r.slot}`, r); if (r.winner_id) dbWin.set(k, r.winner_id); if (r.winner_id && r.winner_id !== r.p1_id && r.winner_id !== r.p2_id) F(`DB winner not in pairing: ${nm(r.winner_id)} for ${nm(r.p1_id)} vs ${nm(r.p2_id)} (${r.round}_${r.slot})`); }
  const currentPairs = new Set(parsed.draw.map((m) => pk(m.p1Id, m.p2Id)));

  // ── CHECK 1: ingest health (running, fresh, error-free) ──
  if (!health) F('no ingest_health row — the ingest has never reported.');
  else {
    if (health.ok !== true) F(`ingest_health.ok = ${health.ok} (error: ${health.error ?? 'n/a'}) — the ingest is failing.`);
    const ageMin = health.last_run_at ? (Date.now() - Date.parse(health.last_run_at)) / 60000 : Infinity;
    if (ageMin > FRESH_MIN) F(`ingest stale — last run ${isFinite(ageMin) ? ageMin.toFixed(0) + ' min ago' : 'never'} (cron should run every 5 min).`);
    else OK(`ingest ran ${ageMin.toFixed(0)} min ago, ok=${health.ok}`);
  }

  // ── CHECK 2: every decided match — truth == parser == DB (no wrong / missing / stale) ──
  let decided = 0;
  const healthFresh = health?.ok === true && (Date.now() - Date.parse(health?.last_run_at ?? 0)) / 60000 <= FRESH_MIN;
  for (const round of SCORED) {
    for (const p of truth[round].values()) {
      if (p.byBold && p.byAdv && p.byBold !== p.byAdv) F(`source self-contradiction ${round}: bold=${nm(p.byBold)} but advances=${nm(p.byAdv)} [${nm(p.aId)} vs ${nm(p.bId)}]`);
      const tw = p.byBold || p.byAdv; if (!tw) continue; decided++;
      const key = pk(p.aId, p.bId);
      const pw = parsedWin.get(key) ?? null, dw = dbWin.get(key) ?? null;
      if (pw && tw !== pw) F(`PARSER wrong ${round}: truth=${nm(tw)} parser=${nm(pw)} [${nm(p.aId)} vs ${nm(p.bId)}]`);
      if (dw && tw !== dw) F(`DB wrong ${round}: truth=${nm(tw)} db=${nm(dw)} [${nm(p.aId)} vs ${nm(p.bId)}]`);
      if (!dw) (healthFresh ? F : W)(`${round}: ${nm(p.aId)} vs ${nm(p.bId)} → ${nm(tw)} decided on Wikipedia but NOT in the DB${healthFresh ? ' (ingest is fresh, so this is a real gap)' : ' (may be within cron lag)'}`);
    }
  }

  // ── CHECK 3: no orphan DB pairing (the slot-stability regression signature) ──
  for (const k of dbPairSet) if (!currentPairs.has(k) && !truth[SCORED.find((r) => truth[r].has(k))]?.has?.(k)) {
    const anyTruth = SCORED.some((r) => truth[r].has(k));
    if (!anyTruth) F(`DB holds a pairing that is NOT in the current draw: ${k.split(' vs ').map(nm).join(' vs ')} — stale/shifted slot.`);
  }

  // ── CHECK 4: parser self-consistency — its own rows never violate winner-in-pairing ──
  const freshRows = buildMatchRows(TID, parsed.draw, parsed.results, {}, {});
  const bad = freshRows.filter((r) => r.winner_id && r.winner_id !== r.p1_id && r.winner_id !== r.p2_id);
  if (bad.length) for (const r of bad) F(`parser produced an impossible row: ${nm(r.winner_id)} not in ${nm(r.p1_id)}/${nm(r.p2_id)} (${r.round}_${r.slot})`);

  // ── report ──
  console.log('================= LIVE VERIFICATION — ' + TID + ' =================');
  console.log(`Wikipedia decided: ${decided} | parser winners: ${parsedWin.size} | DB winners: ${dbWin.size} | DB rows: ${dbRows.length}`);
  if (ok.length) { console.log('\nOK:'); for (const m of ok) console.log('  ✓ ' + m); }
  if (warn.length) { console.log('\nWARN:'); for (const m of warn) console.log('  • ' + m); }
  if (fail.length) { console.log('\nFAIL:'); for (const m of fail) console.log('  ✗ ' + m); }
  console.log('\n' + (fail.length ? `✗ ${fail.length} PROBLEM(S) — data flow is NOT correct.` : '✓ ALL CHECKS PASSED — results recorded correctly.'));
  process.exitCode = fail.length ? 1 : 0;
}

try { await main(); }
catch (e) { console.error('verifier could not complete:', e instanceof Error ? e.message : e); process.exitCode = 2; }
