# Montréal 2026 (National Bank Open) — final archive

Captured **2026-08-18**, before the US Open field is seeded into `public.player_stats`.

## Why this exists

At capture time `public.player_stats` was a **single global table with no `tournament_id` column**,
and `recompute-score` recomputed every entry from scratch every 3 minutes using the `ranking` it
found there. The moment another tournament's field was seeded, Montréal's ranking multipliers and
upset bonuses would change and every historical score would silently move. These files are the
record of the numbers as they actually stood.

*(Fix 1.3 has since added `tournament_id` to that table, so each event owns its rows and this class
of drift is closed going forward. The archive still matters: it is the only record of the window
before that, and of the results themselves.)*

Do not regenerate these from the live database — that is the very thing they exist to survive.

## Contents

| File | Rows | Source |
|---|---|---|
| `board_entries.json` | 8 | `public.board_entries` (the redacting view) — `user_id`, `score`, `budget`, `state` |
| `matches.json` | 63 | `public.matches` — the full draw and every result |
| `player_stats_montreal.json` | 77 | **The rankings Montréal was actually scored on.** See the correction below. |
| `player_stats.json` | 109 | `public.player_stats` as the live table stood on 2026-08-18 — **this is a snapshot of the table AFTER the Cincinnati ranking refresh, NOT Montréal's inputs.** Kept for provenance only. |
| `ingest_health.json` | 1 | final feed state |
| `entries.json` | — | **MISSING** — see below |

### Correction — read this before using `player_stats.json`

This README originally described `player_stats.json` as "the rankings the scores were computed
from". **It is not.** It is a dump of the live table taken on 2026-08-18, by which point the
rankings had already been refreshed for Cincinnati. The tell is Jodar: he is **rank 11** in that
file, but he was **rank 25** when Montréal was played and scored. Any upset multiplier recomputed
from that file would be wrong.

The at-event numbers were recoverable because `src/data/montreal2026Field.json` was written before
the refresh and never touched by it (last modified in `02f505f` / `3434e4f`, both pre-refresh).
`player_stats_montreal.json` is rebuilt from it: **77 players, Jodar at 25, best rank 2.**

That file — not `player_stats.json` — is the one to use if Montréal's scores ever need to be
reproduced or audited.

`player_stats.json` is kept rather than deleted because it is still an honest record of what the
shared table looked like on the day, which is the hazard the archive exists to document.

### The missing entries.json

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
- **Ranking provenance** — ✗ **This check was not performed at capture time, and it is the one that
  failed.** `player_stats.json` was assumed to hold the at-event rankings; it did not. Found and
  corrected on 2026-08-18 by an adversarial review of the apply runbook.

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
