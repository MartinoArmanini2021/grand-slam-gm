// ── Entry legality — the SINGLE source of the rules (client + server) ─────────
// These are the rules the server-side `save_entry` RPC enforces (supabase/save_entry_rpc.sql).
// The client pre-validates with the SAME functions so an illegal squad is caught before the
// round-trip AND the SQL is a faithful mirror — the tier boundaries live only in getTier
// (src/data/tiers.ts); price/tier reach the server as seeded player_stats columns, never a
// SQL reimplementation. KEEP THE SQL IDENTICAL TO THIS.
//
// Why the draft/locked split: while `phase === 'draft'` the client auto-saves the squad as
// it's being BUILT (1, 2, … players), so a partial squad must be legal to save — we cap it
// (no over-quota, no over-budget, no dupes/fakes) but don't require it to be complete. Once
// LOCKED (phase !== 'draft') it must be exactly 10 and exactly 2/3/5. Budget is only checked
// when no transfers have been made — post-lock transfers spend elimination refunds, a
// separate accounting the deferred per-round-freeze work will validate server-side.

import { SQUAD_SIZE, STARTING_BUDGET, TIER_MINIMUMS, MAX_TRANSFERS } from './squadRules';
import { getTier, type Tier } from './tiers';

// The minimal per-player record the validator needs. price + ranking (→ tier) are the
// authoritative values; on the server they come from the seeded player_stats columns.
export interface RosterPricing { id: string; price: number; ranking: number }

export interface EntryLegalityInput {
  squad: string[];       // the squad being saved (state.myTeam)
  phase: string;         // 'draft' = still building (partial allowed); anything else = locked
  hasTransfers: boolean; // once transfers exist, raw-sum budget no longer applies (refunds)
  hasCashedIn: boolean;  // once a player is cashed in, the squad may shrink / drift off 2·3·5
  // Transfer cap (MAX_TRANSFERS). Optional: omit to skip the check (used by fixtures that
  // predate the cap). `priorTransferCount` is what the server already holds — an entry that is
  // ALREADY over the cap (made before the rule, or by a future rule change) can still be saved
  // unchanged; it just can't add another. So the cap blocks new moves, it never bricks an entry.
  transferCount?: number;
  priorTransferCount?: number;
}

// Returns null when legal, else a human-readable reason.
export function validateSquadLegality(
  { squad, phase, hasTransfers, hasCashedIn, transferCount, priorTransferCount }: EntryLegalityInput,
  roster: Map<string, RosterPricing>,
): string | null {
  if (!Array.isArray(squad)) return 'Invalid squad';
  const locked = phase !== 'draft';
  // "touched" = the manager has begun mid-tournament changes (cashed a player in OR bought one).
  // Until then a LOCKED squad is the pristine draft, so it must be exactly 10 · 2/3/5. Once
  // touched it may drop below 10 and drift off the tier quotas (budget is the only limit) —
  // matching the server's save_entry `v_touched`. This is what makes the market flexible in-play.
  const touched = hasTransfers || hasCashedIn;

  if (new Set(squad).size !== squad.length) return 'Squad has duplicate players';
  if (squad.length > SQUAD_SIZE) return `Squad can't exceed ${SQUAD_SIZE} players`;
  if (locked && !touched && squad.length !== SQUAD_SIZE) return `A locked squad must be exactly ${SQUAD_SIZE} players`;

  const counts: Record<Tier, number> = { Platinum: 0, Gold: 0, Silver: 0 };
  let total = 0;
  for (const id of squad) {
    const p = roster.get(id);
    if (!p) return `Unknown player id: ${id}`;
    total += p.price;
    counts[getTier(p.ranking)] += 1;
  }
  for (const { tier, min } of TIER_MINIMUMS) {
    if (!locked && counts[tier] > min) return `Too many ${tier} (max ${min})`;         // draft cap
    if (locked && !touched && counts[tier] !== min) return `A locked squad needs exactly ${min} ${tier} (has ${counts[tier]})`;
  }
  if (!hasTransfers && total > STARTING_BUDGET) return `Squad costs $${total}M — over the $${STARTING_BUDGET}M budget`;

  // Transfer cap. Compared against the greater of the cap and what's already stored, so an entry
  // that is already over (legacy / pre-cap) saves fine — only ADDING beyond the limit is refused.
  if (transferCount != null) {
    const ceiling = Math.max(MAX_TRANSFERS, priorTransferCount ?? 0);
    if (transferCount > ceiling) {
      return `You've used all ${MAX_TRANSFERS} transfers for this tournament`;
    }
  }
  return null;
}

type Pick = { round: string; playerId: string };

// Captain/vice lock (F1(2)): for any round that ALREADY has results, the incoming pick must
// match what was previously stored — you can't choose (or change, or add) a captain/vice for
// a round after seeing how it turned out. Returns null when legal, else the offending round.
export function validateCaptainLock(
  incoming: Pick[] | undefined,
  stored: Pick[] | undefined,
  resultedRounds: Set<string>,
  label: string, // 'captain' | 'vice-captain' — for the message
): string | null {
  const byRound = (arr: Pick[] | undefined) => new Map((arr ?? []).map(p => [p.round, p.playerId]));
  const inc = byRound(incoming);
  const sto = byRound(stored);
  for (const round of resultedRounds) {
    if ((inc.get(round) ?? null) !== (sto.get(round) ?? null)) {
      return `Cannot change your ${round} ${label} — that round has already been played`;
    }
  }
  return null;
}
