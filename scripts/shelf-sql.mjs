// ── The app's shelf for an event: public.tournament_fields (id, field) ──────────────────────────────
//
//   node scripts/shelf-sql.mjs paris_2026        → writes supabase/<today>_<event>_shelf.sql
//
// The app reads its draft pool ONLY from the shelf (src/lib/game/useActiveTournament.ts, fieldQuery):
// with no row it shows "being set up" and nobody can draft. The field file is camelCase and nested
// (atpId, ranking, surface.hard, ytd.wins, yearResults); the shelf is flat snake_case (atp_id,
// atp_rank, hard_pct, ytd_wins, year_results), the trap in docs/TOURNAMENT_CHANGEOVER.md §1.5.
// Rank, price and tier come from the event's player_stats seed, not recomputed, so the shelf and the
// server's validation (save_entry reads player_stats) can never disagree. Writes nothing to the DB.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS } from './lib/events.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
const ev = EVENTS[id];
if (!ev) {
  console.error(`usage: node scripts/shelf-sql.mjs <event-id>\nknown: ${Object.keys(EVENTS).join(', ')}`);
  process.exit(2);
}

const field = JSON.parse(readFileSync(resolve(ROOT, ev.field), 'utf8'));
const seed = readFileSync(resolve(ROOT, ev.seed), 'utf8');
const stats = new Map();
for (const m of seed.matchAll(/\('([^']+)', '([^']+)', (\d+), (\d+(?:\.\d+)?), '(\w+)'\)/g)) {
  if (m[1] === id) stats.set(m[2], { atp_rank: +m[3], price: +m[4], tier: m[5].toLowerCase() });
}

const missing = field.filter((p) => !stats.has(p.id)).map((p) => p.id);
if (missing.length) {
  console.error(`✗ ${missing.length} player(s) in the field have no row in ${ev.seed}: ${missing.join(', ')}. Run gen-seed first.`);
  process.exit(1);
}

const shelf = field.map((p) => {
  const s = stats.get(p.id);
  return {
    id: p.id,
    name: p.name,
    country: p.country ?? null,
    flag: p.flag ?? null,
    age: p.age ?? null,
    hand: p.hand ?? null,
    atp_id: p.atpId ?? null,
    atp_rank: s.atp_rank,
    price: s.price,
    tier: s.tier,
    seed: p.seed ?? null,
    style: p.style ?? null,
    hard_pct: p.surface?.hard ?? null,
    clay_pct: p.surface?.clay ?? null,
    grass_pct: p.surface?.grass ?? null,
    ytd_wins: p.ytd?.wins ?? null,
    ytd_losses: p.ytd?.losses ?? null,
    ytd_titles: p.ytd?.titles ?? null,
    year_results: p.yearResults ?? [],
  };
});

const today = new Date().toISOString().slice(0, 10);
const out = `supabase/${today}_${id}_shelf.sql`;
const json = JSON.stringify(shelf);
if (json.includes('$shelf$')) throw new Error('unexpected delimiter in the data');
writeFileSync(resolve(ROOT, out), `-- ${id}: the app's shelf (public.tournament_fields). Generated ${today} by scripts/shelf-sql.mjs from
-- ${ev.field} + ${ev.seed} (${shelf.length} players). NOT APPLIED: apply on Martino's word, BEFORE the switch
-- of active_tournament_id (without it the app cannot draft). Rank, price and tier = the seed's.

-- PRE-CHECK (read-only)
select count(*) as rows_now from public.tournament_fields where tournament_id = '${id}';   -- expect 0

-- UP
insert into public.tournament_fields (tournament_id, field, updated_at)
values ('${id}', $shelf$${json}$shelf$::jsonb, now())
on conflict (tournament_id) do update set field = excluded.field, updated_at = now();

-- VERIFY (read-only): ${shelf.length} players, the same keys as an earlier event, prices = player_stats
select jsonb_array_length(field) as players,
       (select string_agg(k, ',' order by k) from jsonb_object_keys(field->0) k) as keys
  from public.tournament_fields where tournament_id = '${id}';
select count(*) as price_or_tier_mismatches
  from public.tournament_fields f, jsonb_array_elements(f.field) p
  join public.player_stats s on s.tournament_id = '${id}' and s.id = p->>'id'
 where f.tournament_id = '${id}' and ((p->>'price')::numeric <> s.price or lower(s.tier) <> p->>'tier');   -- expect 0

-- ROLLBACK
-- delete from public.tournament_fields where tournament_id = '${id}';
`);
const tiers = shelf.reduce((a, p) => ((a[p.tier] = (a[p.tier] ?? 0) + 1), a), {});
console.log(`✓ wrote ${shelf.length} players → ${out}  (tiers ${JSON.stringify(tiers)})`);
