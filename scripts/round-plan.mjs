// ── The round plan, from a short schedule file instead of hand-written SQL ──────────────────────────
//
//   node scripts/round-plan.mjs paris_2026                 → writes supabase/<today>_paris_2026_round_plan.sql
//   node scripts/round-plan.mjs paris_2026 --print         → prints it instead
//   node scripts/round-plan.mjs paris_2026 --pin R16 "2026-11-05 12:30" "order of play, Court Central"
//                                                          → prints the one UPDATE that pins a round's first
//                                                            ball from the published order of play
//
// The schedule lives in scripts/schedules/<id>.json, in the tournament's OWN local time — the way an
// order of play is published — so nobody converts time zones by hand (Shanghai's plan was all hand-
// converted to UTC; one slip there and the market stays open during play):
//
//   { "tz": "Europe/Paris",
//     "rounds": [ { "round": "R32", "local": "2026-11-03 11:00", "note": "2nd round, draft lock" }, … ] }
//
// The first round listed is the first SCORED round (its prev_round is null: the round before it is
// either unscored or does not exist). Every later round's prev_round is the round listed before it.
// Slots come from the round code (R64 = 32 matches …). Times are early floors until pinned.
// Writes nothing to the database: the SQL file is applied on Martino's word, like every migration.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SLOTS = { R128: 64, R64: 32, R32: 16, R16: 8, QF: 4, SF: 2, F: 1 };
const ORDER = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];

/** UTC instant for a wall-clock time in an IANA zone (DST-safe, no libraries). */
export function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) throw new Error(`bad local time "${local}" (want YYYY-MM-DD HH:MM)`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date(ms)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]),
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc); // second pass settles the DST edge
  const back = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date(utc)).replace(',', '');
  if (back !== `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`) throw new Error(`"${local}" does not exist in ${tz} (a DST gap)`);
  return new Date(utc);
}

const rome = (date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);

/** The schedule, checked: known rounds, in draw order, each later than the one before. */
export function planRows(id, spec) {
  if (!spec?.tz) throw new Error('schedule needs "tz" (e.g. "Europe/Paris")');
  if (!Array.isArray(spec.rounds) || spec.rounds.length === 0) throw new Error('schedule needs "rounds"');
  const rows = [];
  let prev = null;
  for (const r of spec.rounds) {
    if (!(r.round in SLOTS)) throw new Error(`unknown round "${r.round}"`);
    if (prev && ORDER.indexOf(r.round) !== ORDER.indexOf(prev.round) + 1)
      throw new Error(`${r.round} must come right after ${ORDER[ORDER.indexOf(prev.round) + 1] ?? '—'}, not after ${prev.round}`);
    const first = zonedToUtc(r.local, spec.tz);
    if (prev && first <= prev.first) throw new Error(`${r.round} (${r.local}) is not after ${prev.round} (${prev.local})`);
    rows.push({
      tournament_id: id,
      round: r.round,
      slots: SLOTS[r.round],
      first,
      local: r.local,
      prev_round: prev?.round ?? null,
      prev_slots: prev ? SLOTS[prev.round] : null,
      note: `${r.pinned ? 'pinned' : 'floor'} ${r.local} ${spec.tz}${r.note ? ` (${r.note})` : ''}${r.pinned ? '' : ' — pin from the order of play'}`,
    });
    prev = { round: r.round, first, local: r.local };
  }
  if (rows.at(-1).round !== 'F') throw new Error('the schedule must end with the final (F)');
  return rows;
}

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

export function planSql(id, spec, today = new Date().toISOString().slice(0, 10)) {
  const rows = planRows(id, spec);
  const first = rows[0];
  const values = rows
    .map((r) => `  (${q(id)}, ${q(r.round)}, ${String(r.slots).padStart(2)}, ${q(r.first.toISOString().replace('.000', ''))}, ${q(r.prev_round)}, ${r.prev_slots ?? 'null'}, ${q(r.note)})`)
    .join(',\n');
  const table = rows.map((r) => `--   ${r.round.padEnd(4)} ${r.local} ${spec.tz.padEnd(16)} = ${r.first.toISOString().slice(0, 16)}Z = ${rome(r.first)} Rome`).join('\n');
  return `-- =====================================================================================================
-- ${id} — the round plan (the market's lock times). Generated ${today} by scripts/round-plan.mjs from
-- scripts/schedules/${id}.json. NOT APPLIED: apply on Martino's word. Inserting before the flip changes
-- nothing live: market_window_controller reads only the ACTIVE tournament's rows.
--
${table}
--
-- Times marked "floor" are the earliest plausible first ball, not a confirmed one: early is recoverable
-- (the market closes a little sooner), late is not (the market stays open during play). Pin each round
-- from the published order of play the evening before:
--   node scripts/round-plan.mjs ${id} --pin <ROUND> "<YYYY-MM-DD HH:MM local>" "<source>"
-- and only re-time a round that has not begun.
--
-- ${first.round} has no prev_round, so it becomes ready only through the 6-hour valve; its rows (written by
-- the feed from draw day) are stamped by hand at the flip so the app shows the squad-lock countdown:
--   update public.matches m set started_at = p.first_ball from public.round_plan p
--    where m.tournament_id = ${q(id)} and m.round = ${q(first.round)}
--      and p.tournament_id = m.tournament_id and p.round = m.round;
-- =====================================================================================================

-- PRE-CHECK (read-only)
select (select count(*) from public.round_plan where tournament_id = ${q(id)}) as rows_now,   -- expect 0
       public.active_tournament_id() as active;

-- UP
begin;
insert into public.round_plan (tournament_id, round, slots, first_ball, prev_round, prev_slots, note) values
${values};
commit;

-- VERIFY (read-only)
select round, slots, first_ball, first_ball at time zone ${q(spec.tz)} as local, first_ball at time zone 'Europe/Rome' as rome,
       prev_round, prev_slots
  from public.round_plan where tournament_id = ${q(id)} order by first_ball;
select * from public.round_plan_health(${q(id)});

-- ROLLBACK
-- delete from public.round_plan where tournament_id = ${q(id)};
`;
}

export function pinSql(id, spec, round, local, source) {
  if (!(round in SLOTS)) throw new Error(`unknown round "${round}"`);
  const at = zonedToUtc(local, spec.tz);
  return `-- Pin ${id} ${round}: ${local} ${spec.tz} = ${at.toISOString().slice(0, 16)}Z = ${rome(at)} Rome
-- Only for a round that has NOT begun (re-timing a begun round reopens its market).
update public.round_plan
   set first_ball = ${q(at.toISOString().replace('.000', ''))}, note = ${q(`pinned ${local} ${spec.tz}${source ? ` (${source})` : ''}`)}, updated_at = now()
 where tournament_id = ${q(id)} and round = ${q(round)}
   and not exists (select 1 from public.matches m where m.tournament_id = ${q(id)} and m.round = ${q(round)}
                     and (m.winner_id is not null or (m.started_at is not null and m.started_at <= now())));
-- expect: UPDATE 1 (UPDATE 0 = the round has begun, or a wrong id/round)
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, ...rest] = process.argv.slice(2);
  if (!id) {
    console.error('usage: node scripts/round-plan.mjs <tournament_id> [--print | --pin ROUND "YYYY-MM-DD HH:MM" "source"]');
    process.exit(2);
  }
  const file = resolve(ROOT, 'scripts', 'schedules', `${id}.json`);
  if (!existsSync(file)) {
    console.error(`no schedule: ${file}`);
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  try {
    if (rest[0] === '--pin') {
      console.log(pinSql(id, spec, rest[1], rest[2] ?? '', rest[3] ?? ''));
    } else {
      const sql = planSql(id, spec);
      if (rest[0] === '--print') console.log(sql);
      else {
        const out = resolve(ROOT, 'supabase', `${new Date().toISOString().slice(0, 10)}_${id}_round_plan.sql`);
        writeFileSync(out, sql);
        console.log(`wrote ${out}`);
        for (const r of planRows(id, spec)) console.log(`  ${r.round.padEnd(4)} ${r.local} → ${r.first.toISOString().slice(0, 16)}Z (${rome(r.first)} Rome)`);
      }
    }
  } catch (e) {
    console.error(`round-plan: ${e.message}`);
    process.exit(1);
  }
}
