// ── Do the two scoring engines agree? ────────────────────────────────────────────────────────────
//
// Runs the LIVE engine (supabase/functions/recompute-score) and the LOVABLE rebuild's engine
// (src/lib/game/engine.ts in the Lovable project) over the SAME real Cincinnati data — the actual
// matches, the actual rankings, the actual four scoring entries — and diffs the results.
//
// This exists because "does the rebuild reproduce the game?" is not a judgement call. Either the
// numbers match or they do not, and if they do not, adopting it silently re-scores four real
// managers mid-tournament.
//
//   node scripts/compare-engines.mjs
//
// Data captured from production 2026-08-18 (read-only). Both engines are transcribed faithfully
// from their sources; where the two differ, that difference is the finding.

// ── the real data ────────────────────────────────────────────────────────────────────────────────
const MATCHES = [
  ['R64',0,'zverev','norrie','zverev'],['R64',1,'atmane','etcheverry','atmane'],
  ['R64',2,'paul','hurkacz','paul'],['R64',3,'vallejo','vacherot','vallejo'],
  ['R64',4,'jodar','shapovalov','jodar'],['R64',5,'struff','tabilo','tabilo'],
  ['R64',6,'blockx','navone','blockx'],['R64',7,'kecmanovic','cobolli','cobolli'],
  ['R64',8,'djokovic','tirante','tirante'],['R64',9,'landaluce','arnaldi','landaluce'],
  ['R64',10,'darderi','hijikata','hijikata'],['R64',11,'bellucci','mensik','mensik'],
  ['R64',12,'lehecka','berrettini','lehecka'],['R64',13,'hanfmann','fils','fils'],
  ['R64',14,'fery','duckworth','fery'],['R64',15,'halys','deminaur','deminaur'],
  ['R64',16,'fritz','michelsen','fritz'],['R64',17,'merida','bergs','merida'],
  ['R64',18,'fonseca','zandschulp','fonseca'],['R64',19,'connell','ruud','connell'],
  ['R64',20,'rublev','busta','rublev'],['R64',21,'borges','franciscocerundolo','borges'],
  ['R64',22,'nakashima','kovacevic','nakashima'],['R64',23,'trungelliti','medvedev','medvedev'],
  ['R64',24,'shelton','faria','faria'],['R64',25,'walton','buse','walton'],
  ['R64',26,'humbert','zheng','zheng'],['R64',27,'altmaier','musetti','musetti'],
  ['R64',28,'tien','baez','tien'],['R64',29,'sonego','tiafoe','tiafoe'],
  ['R64',30,'rinderknech','cerundolo','cerundolo'],['R64',31,'tsitsipas','augeraliassime','augeraliassime'],
  ['R32',0,'zverev','atmane','zverev'],['R32',1,'paul','vallejo','paul'],
  ['R32',2,'jodar','tabilo','jodar'],['R32',3,'blockx','cobolli','cobolli'],
  ['R32',4,'tirante','landaluce','tirante'],['R32',5,'hijikata','mensik','mensik'],
  ['R32',6,'lehecka','fils','fils'],['R32',7,'fery','deminaur','deminaur'],
  ['R32',8,'fritz','merida',null],['R32',9,'fonseca','connell','connell'],
  ['R32',10,'rublev','borges','borges'],['R32',11,'nakashima','medvedev',null],
  ['R32',12,'faria','walton',null],['R32',13,'zheng','musetti',null],
  ['R32',14,'tien','tiafoe',null],['R32',15,'cerundolo','augeraliassime',null],
  ['R16',0,'zverev','paul',null],['R16',1,'jodar','cobolli',null],
  ['R16',2,'tirante','mensik',null],['R16',3,'fils','deminaur',null],
].map(([round, slot, p1, p2, winner]) => ({ round, slot, p1, p2, winner }));

const RANKS = {zverev:3,augeraliassime:4,djokovic:5,shelton:6,medvedev:7,deminaur:8,fritz:9,cobolli:10,jodar:11,tien:12,lehecka:14,musetti:15,mensik:16,ruud:17,rublev:18,vacherot:19,darderi:20,fils:21,nakashima:22,tiafoe:23,paul:24,franciscocerundolo:25,fonseca:26,rinderknech:28,tabilo:29,humbert:30,etcheverry:31,blockx:32,bergs:33,arnaldi:34,norrie:35,buse:36,fery:37,collignon:38,khachanov:39,merida:40,michelsen:41,berrettini:42,struff:43,navone:44,atmane:45,borges:47,shapovalov:48,tsitsipas:49,tirante:50,cerundolo:51,mannarino:52,baez:53,assche:54,hanfmann:55,griekspoor:56,halys:57,zandschulp:59,burruchaga:61,machac:62,marozsan:63,altmaier:65,kecmanovic:66,landaluce:67,majchrzak:68,hurkacz:69,vallejo:70,kopriva:71,busta:72,medjedovic:73,brooksby:74,carabelli:76,choinski:77,royer:78,faria:79,cilic:80,bellucci:81,fucsovics:82,svajda:84,duckworth:86,sonego:88,shimabukuro:90,trungelliti:91,wong:93,hijikata:95,kovacevic:96,walton:98,prizmic:103,jong:106,droguet:115,zheng:121,connell:127,jacquet:134,mejia:136,dimitrov:142,draper:147,lajal:150,shang:270,monfils:327,kokkinakis:443,wolf:688};

const ENTRIES = [
  { who: '49b012ea', stored: 22,
    initialSquad: ['berrettini','shelton','jodar','fritz','fils','paul','landaluce','altmaier','connell','atmane'],
    transfers: [{in:'fonseca',out:'altmaier',round:'R64'},{in:'blockx',out:'berrettini',round:'R64'},{in:'faria',out:'shelton',round:'R64'}],
    captainHistory: [{round:'R64',playerId:'jodar'},{round:'R32',playerId:'jodar'}],
    viceCaptainHistory: [{round:'R64',playerId:'shelton'},{round:'R32',playerId:'fritz'}] },
  { who: '0f7892be', stored: 24.5,
    initialSquad: ['zverev','cobolli','walton','rublev','fils','zheng','tsitsipas','sonego','kovacevic','vacherot'],
    transfers: [{in:'mensik',out:'vacherot',round:'R64'},{in:'connell',out:'tsitsipas',round:'R64'}],
    captainHistory: [{round:'R64',playerId:'zverev'}],
    viceCaptainHistory: [{round:'R64',playerId:'cobolli'}] },
  { who: '45576f33', stored: 7.5,
    initialSquad: ['shelton','fritz','rublev','jodar','ruud','busta','walton','bellucci','hurkacz','bergs'],
    transfers: [],
    captainHistory: [{round:'R64',playerId:'shelton'}],
    viceCaptainHistory: [{round:'R64',playerId:'fritz'}] },
  { who: 'e3a43da2', stored: 18.5,
    initialSquad: ['shelton','cobolli','jodar','fils','tien','fonseca','zheng','bellucci','vallejo','kovacevic'],
    transfers: [{in:'mensik',out:'shelton',round:'R64'}],
    captainHistory: [{round:'R64',playerId:'shelton'},{round:'R32',playerId:'fonseca'}],
    viceCaptainHistory: [{round:'R64',playerId:'cobolli'},{round:'R32',playerId:'mensik'}] },
];

// ── ENGINE A — live, transcribed from supabase/functions/recompute-score/index.ts ────────────────
const A_ORDER = ['R128','R64','R32','R16','QF','SF','F'];
const A_POINTS = { R128:1, R64:1, R32:2, R16:5, QF:10, SF:20, F:40 };
const A_upset = (w, l) => (l == null || w <= l) ? 1 : 1 + (w - l) / ((w - l) + 30);
// THE KEY LINE: base x upset is rounded to a WHOLE NUMBER first; the captain/vice multiplier is
// applied afterwards. That ordering is what makes half-points exist (vice x1.5 of an odd number).
const A_winPoints = (base, w, l) => Math.round(base * A_upset(w, l));
const A_idx = r => A_ORDER.indexOf(r);

function A_leaderOfRecord(history, round) {
  const ri = A_idx(round);
  let best;
  for (const h of history ?? []) {
    const hi = A_idx(h.round);
    if (hi >= 0 && hi <= ri && (best === undefined || A_idx(best.round) < hi)) best = h;
  }
  return best?.playerId;
}

function engineA(entry, matches, ranks) {
  const played = A_ORDER.filter(r => matches.some(m => m.round === r && m.winner));
  const rank = id => ranks[id] ?? 40;
  let total = 0;
  const byRound = {};
  for (const round of played) {
    const ri = A_idx(round);
    let squad = [...entry.initialSquad];
    for (const t of entry.transfers ?? []) if (A_idx(t.round) < ri) squad = squad.map(id => (id === t.out ? t.in : id));
    const captain = A_leaderOfRecord(entry.captainHistory, round);
    const vice = A_leaderOfRecord(entry.viceCaptainHistory, round);
    const base = A_POINTS[round] ?? 0;
    const rm = matches.filter(m => m.round === round);
    let sub = 0;
    for (const id of squad) {
      const m = rm.find(x => x.p1 === id || x.p2 === id);
      if (!m || m.winner !== id) continue;
      const opp = m.p1 === id ? m.p2 : m.p1;
      const pts = A_winPoints(base, rank(id), ranks[opp]);
      sub += id === captain ? pts * 2 : id === vice ? pts * 1.5 : pts;
    }
    byRound[round] = sub; total += sub;
  }
  return { total, byRound };
}

// ── ENGINE B — the Lovable rebuild, transcribed from its src/lib/game/engine.ts ──────────────────
const B_ORDER = ['R128','R96','R64','R32','R16','QF','SF','F'];
const B_POINTS = { R128:1, R96:0, R64:1, R32:2, R16:5, QF:10, SF:20, F:40 };
const B_idx = r => { const i = B_ORDER.indexOf(r); return i <= 1 ? 0 : i - 1; };
const B_round2 = n => Math.round(n * 100) / 100;
const B_upset = (w, l) => { if (!w || !l) return 1; const gap = w - l; return gap <= 0 ? 1 : 1 + gap / (gap + 30); };

function B_squadForRound(e, round) {
  const squad = [...e.initial_squad];
  const target = B_idx(round);
  for (const t of e.transfers) {
    if (B_idx(t.effective_round) > target) continue;
    const i = squad.indexOf(t.out_player);
    if (i >= 0) squad[i] = t.in_player;
  }
  return squad;
}
function B_captainForRound(e, round) {
  const target = B_idx(round);
  let best = null;
  for (const p of e.captain_picks) {
    if (B_idx(p.round) > target) continue;
    if (!best || B_idx(p.round) >= B_idx(best.round)) best = p;
  }
  return { captain: best?.captain ?? null, vice: best?.vice ?? null };
}
function engineB(e, matches, ranks) {
  let total = 0; const byRound = {};
  for (const round of B_ORDER) {
    const inRound = matches.filter(m => m.round === round && m.winner);
    if (inRound.length === 0) continue;
    const base = B_POINTS[round];
    const squad = B_squadForRound(e, round);
    const { captain, vice } = B_captainForRound(e, round);
    let points = 0;
    for (const m of inRound) {
      const winner = m.winner;
      if (!squad.includes(winner)) continue;
      const loser = m.p1 === winner ? m.p2 : m.p1;
      const upset = B_upset(ranks[winner], loser ? ranks[loser] : null);
      const role = winner === captain ? 'captain' : winner === vice ? 'vice' : null;
      const roleMult = role === 'captain' ? 2 : role === 'vice' ? 1.5 : 1;
      // THE KEY DIFFERENCE: no intermediate rounding. base x upset x role, rounded to 2dp at the end.
      points += B_round2(base * upset * roleMult);
    }
    points = B_round2(points);
    byRound[round] = points; total = B_round2(total + points);
  }
  return { total, byRound };
}

// Faithful translation of a live entry into the Lovable shape.
function toB(entry) {
  return {
    initial_squad: entry.initialSquad,
    // Engine A applies a transfer from the round AFTER the one it is logged against
    // (`A_idx(t.round) < ri`); engine B applies it AT its effective_round. Same rule, shifted name.
    transfers: (entry.transfers ?? []).map(t => ({
      effective_round: A_ORDER[A_idx(t.round) + 1] ?? t.round,
      out_player: t.out, in_player: t.in,
    })),
    // A keeps captain and vice as INDEPENDENT histories; B stores them as one pick per round.
    // Merged here per round so the comparison isolates the arithmetic rather than this difference.
    captain_picks: [...new Set([...(entry.captainHistory ?? []), ...(entry.viceCaptainHistory ?? [])].map(h => h.round))]
      .map(round => ({
        round,
        captain: A_leaderOfRecord(entry.captainHistory, round) ?? null,
        vice: A_leaderOfRecord(entry.viceCaptainHistory, round) ?? null,
      })),
  };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────
console.log('\n  Cincinnati 2026 — the SAME matches, ranks and entries through both engines\n');
console.log('  manager     stored   live engine   Lovable engine   difference');
console.log('  ' + '-'.repeat(64));
let mismatches = 0;
for (const e of ENTRIES) {
  const a = engineA(e, MATCHES, RANKS);
  const b = engineB(toB(e), MATCHES, RANKS);
  const diff = B_round2(b.total - a.total);
  if (Math.abs(diff) > 0.001) mismatches++;
  console.log(
    '  ' + e.who.padEnd(11) +
    String(e.stored).padStart(5) +
    String(a.total).padStart(13) +
    String(b.total).padStart(17) +
    (diff === 0 ? '            —' : ('  ' + (diff > 0 ? '+' : '') + diff).padStart(13)),
  );
}
console.log('  ' + '-'.repeat(64));
console.log(`\n  ${mismatches} of ${ENTRIES.length} managers would be scored differently.\n`);

// Per-round detail for the first mismatch, so the cause is visible rather than asserted.
for (const e of ENTRIES) {
  const a = engineA(e, MATCHES, RANKS), b = engineB(toB(e), MATCHES, RANKS);
  if (Math.abs(b.total - a.total) < 0.001) continue;
  console.log(`  Where ${e.who} diverges:`);
  for (const r of ['R64','R32']) {
    console.log(`    ${r}:  live ${a.byRound[r] ?? 0}   Lovable ${b.byRound[r] ?? 0}`);
  }
  break;
}
console.log('');
