# Montréal 2026 (National Bank Open) — final archive

Captured **2026-08-18**, before the US Open field is seeded into `public.player_stats`.

## Why this exists

`public.player_stats` is a **single global table with no `tournament_id` column**, and
`recompute-score` recomputes every entry from scratch every 3 minutes using the `ranking` it finds
there. The moment another tournament's field is seeded, Montréal's ranking multipliers and upset
bonuses change and every historical score silently moves. These files are the only record of the
numbers as they actually stood.

Do not regenerate these from the live database — that is the very thing they exist to survive.

## Contents

| File | Rows | Source |
|---|---|---|
| `board_entries.json` | 8 | `public.board_entries` (the redacting view) — `user_id`, `score`, `budget`, `state` |
| `matches.json` | 63 | `public.matches` — the full draw and every result |
| `player_stats.json` | 109 | `public.player_stats` as it stood for Montréal — the rankings the scores were computed from |
| `ingest_health.json` | 1 | final feed state |
| `entries.json` | — | **MISSING** — see below |

`entries.json` could not be captured: `public.entries` is correctly revoked from the `anon` role
(`42501 permission denied`), which is the security boundary working as designed. `board_entries`
carries `user_id`, `score` and `state`, so the only fields not archived are **`rev` and
`updated_at`** — bookkeeping columns that do not affect any score or standing. If you want them,
run this in the Supabase SQL editor and save the result here as `entries.json`:

```sql
select user_id, score, state, rev, updated_at
from public.entries
where tournament_id = 'montreal_2026';
```

## Verification performed at capture time

- **Round counts** — R64 32/32 · R32 16/16 · R16 8/8 · QF 4/4 · SF 2/2 · F 1/1. 63 rows, every
  match resolved. ✓
- **The final** — Ben Shelton beat Brandon Nakashima. Matches the real-world result. ✓
- **Feed health** — last run 2026-08-14T10:50:02Z, `ok: true`, `error: null`, 63 pairings,
  63 results known, 63 rows written. ✓
- **`drafted_missing` (19 players)** — every one checked against the draw. **None of them ever
  appeared in a Montréal pairing**, so all 19 are genuine non-entrants (players in the draftable
  field who withdrew or were never in the main draw), not name-matching failures. No user lost
  points to a mismatch. ✓

## Final standings

| # | user (first 8) | score |
|---|---|---|
| 1 | `96f09bf4` | 199.5 |
| 2 | `0f7892be` | 186 |
| 3 | `51face7f` | 165.5 |
| 4 | `45576f33` | 148 |
| 5 | `e3a43da2` | 127 |
| 6 | `49b012ea` | 39 |

Two further entries exist with no drafted squad and are omitted from the table.
