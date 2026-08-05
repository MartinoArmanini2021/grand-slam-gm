import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GamePhase, RoundId, RoundScore, BudgetReturn, Transfer } from '../types';
import {
  ROUNDS, getMatchesForRound, isPlayerOut, BUDGET_RETURN_RATES, winPoints, transfersOpen, roundPlayable, roundHasResult,
  tournamentStarted,
} from '../data/tournament';
import { ACTIVE_TOURNAMENT_ID } from '../data/tournamentConfig';
import { track } from '../data/analytics';
import { toast } from './toastStore';
import { findPlayer, PLAYERS } from '../data/players';
import { SQUAD_SIZE, STARTING_BUDGET, isTierFull } from '../data/squadRules';
import { getTier } from '../data/tiers';
import { round1 } from '../data/format';

const CAPTAIN_MULTIPLIER = 2;   // captain doubles their round points
const VICE_MULTIPLIER = 1.5;    // vice-captain earns 1.5× their round points

// Ensure two distinct on-court leaders: keep any valid current pick, then fill an
// empty slot with the best-ranked still-alive squad member (Platinum first). This
// guarantees the court always fields a captain + vice when the squad has ≥2 players,
// so it's always 2 on court + the rest on the bench.
function pickLeaders(team: string[], captain: string | null, vice: string | null, revealed: RoundId[]) {
  // A valid leader is on the team AND not eliminated — so a restored save never fields
  // a captain/vice who is already out (the fill list below is alive-only too).
  const valid = (id: string | null): id is string => !!id && team.includes(id) && !isPlayerOut(id, revealed);
  let cap = valid(captain) ? captain : null;
  let vc = valid(vice) && vice !== cap ? vice : null;
  const byRank = team
    .filter(id => !isPlayerOut(id, revealed))
    .sort((a, b) => (findPlayer(a)?.ranking ?? 9999) - (findPlayer(b)?.ranking ?? 9999));
  if (!cap) cap = byRank.find(id => id !== vc) ?? null;
  if (!vc) vc = byRank.find(id => id !== cap) ?? null;
  return { captain: cap, viceCaptain: vc };
}

// STRICT captain-of-record (P1): a round's captain/vice counts only if it was committed
// BEFORE that round produced a result — mirroring the server's save_entry lock, which
// rejects a post-result change. So we stamp the current leaders into the history the moment
// they're set during pre_round while the round is still open; once the round has any result
// the pick is frozen (setCaptain refuses, the court disables it). Upsert = replace this
// round's entry, or drop it when the slot is vacated (playerId null). Recording after the
// round has a result is a no-op — the server would reject that write, and it would be a
// retroactive captain pick (the captain twin of the P3 squad hole).
// User-facing feedback when a captain/vice change is refused because the round already
// started — otherwise the tap silently does nothing and the pick looks (wrongly) set.
function warnLeaderLocked(roundIndex: number) {
  const label = ROUNDS[roundIndex]?.label ?? 'This round';
  toast(`🔒 ${label} is underway — captain & vice lock at the round's first match.`, 'warn');
}

function recordLeaders(
  roundId: RoundId | undefined,
  captain: string | null,
  viceCaptain: string | null,
  captainHistory: { round: RoundId; playerId: string }[],
  viceCaptainHistory: { round: RoundId; playerId: string }[],
) {
  if (!roundId || roundHasResult(roundId)) return { captainHistory, viceCaptainHistory };
  const upsert = (hist: { round: RoundId; playerId: string }[], playerId: string | null) => {
    const rest = hist.filter(c => c.round !== roundId);
    return playerId ? [...rest, { round: roundId, playerId }] : rest;
  };
  return { captainHistory: upsert(captainHistory, captain), viceCaptainHistory: upsert(viceCaptainHistory, viceCaptain) };
}

// Make ANY restored state safe to run — used by every hydration path (localStorage
// migrate + rehydrate AND the cloud restore in CloudSync, which formerly bypassed all
// of this). Mutates in place: (1) drops player ids no longer in the roster so the
// throwing getPlayer() can't white-screen a page; (2) clamps currentRoundIndex and
// reconciles the phase so a save from a different round-count can't get stuck; (3)
// re-derives a draft budget after a price-curve change; (4) re-fields two alive leaders.
export function sanitizeState(s: Partial<GameStore>): void {
  if (!s) return;
  const ids = new Set(PLAYERS.map(p => p.id));
  if (Array.isArray(s.myTeam)) s.myTeam = s.myTeam.filter(id => ids.has(id));
  if (Array.isArray(s.initialSquad)) s.initialSquad = s.initialSquad.filter(id => ids.has(id));
  if (Array.isArray(s.transfers)) s.transfers = s.transfers.filter(t => ids.has(t.in) && ids.has(t.out));
  if (s.captain && !ids.has(s.captain)) s.captain = null;
  if (s.viceCaptain && !ids.has(s.viceCaptain)) s.viceCaptain = null;
  if (s.viewPlayer && !ids.has(s.viewPlayer)) s.viewPlayer = '';
  if (Array.isArray(s.budgetReturns)) s.budgetReturns = s.budgetReturns.filter(r => ids.has(r.playerId));
  if (Array.isArray(s.captainHistory)) s.captainHistory = s.captainHistory.filter(c => ids.has(c.playerId));
  if (Array.isArray(s.viceCaptainHistory)) s.viceCaptainHistory = s.viceCaptainHistory.filter(c => ids.has(c.playerId));
  // Round index in range, and phase consistent with it (a save from a longer draw, or
  // a corrupt index, can't leave the app stuck in pre_round with no round to play).
  if (typeof s.currentRoundIndex === 'number') {
    s.currentRoundIndex = Math.max(0, Math.min(ROUNDS.length, Math.floor(s.currentRoundIndex)));
    if (s.currentRoundIndex >= ROUNDS.length && (s.phase === 'pre_round' || s.phase === 'round_complete')) {
      s.phase = 'finished';
    }
  }
  // Draft budget is exactly STARTING_BUDGET − squad cost; recompute after price changes.
  if (s.phase === 'draft' && Array.isArray(s.myTeam)) {
    const priceById = new Map(PLAYERS.map(p => [p.id, p.price]));
    s.budget = round1(STARTING_BUDGET - s.myTeam.reduce((sum, id) => sum + (priceById.get(id) ?? 0), 0));
  }
  // Always field two still-alive on-court leaders (older saves may have one, none, or
  // an eliminated pick — pickLeaders now filters eliminated players out).
  if ((s.phase === 'draft' || s.phase === 'pre_round') && Array.isArray(s.myTeam)) {
    const revealed = ROUNDS.slice(0, s.currentRoundIndex ?? 0).map(r => r.id);
    const led = pickLeaders(s.myTeam, s.captain ?? null, s.viceCaptain ?? null, revealed);
    s.captain = led.captain; s.viceCaptain = led.viceCaptain;
  }
}

interface GameStore {
  phase: GamePhase;
  myTeam: string[];
  initialSquad: string[]; // the squad as drafted (before any transfers) — for history
  transfers: Transfer[];  // mid-tournament replacements you've made, in order
  captain: string | null;
  viceCaptain: string | null;
  captainHistory: { round: RoundId; playerId: string }[];
  viceCaptainHistory: { round: RoundId; playerId: string }[];
  budget: number;
  budgetReturns: BudgetReturn[];
  currentRoundIndex: number;
  myScore: number;
  roundScores: RoundScore[];
  activeTab: 'home' | 'draft' | 'tournament' | 'team' | 'league' | 'player' | 'admin';
  viewTeam: string; // which team the detail view shows: 'you' or a rival id
  viewPlayer: string; // which player the profile page shows
  playerReturnTab: GameStore['activeTab']; // where the profile's back button returns to
  // Actions
  addPlayer: (id: string) => void;
  removePlayer: (id: string) => void;
  setCaptain: (id: string) => void;
  setViceCaptain: (id: string) => void;
  benchLeader: (id: string) => void;
  ensureLeaders: () => void;
  finalizeDraft: () => void;
  replacePlayer: (oldId: string, newId: string) => void;
  playNextRound: () => void;
  continueToNextRound: () => void;
  setActiveTab: (tab: GameStore['activeTab']) => void;
  openTeam: (teamId: string) => void;
  openPlayer: (playerId: string) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      phase: 'draft',
      myTeam: [],
      initialSquad: [],
      transfers: [],
      captain: null,
      viceCaptain: null,
      captainHistory: [],
      viceCaptainHistory: [],
      budget: STARTING_BUDGET,
      budgetReturns: [],
      currentRoundIndex: 0,
      myScore: 0,
      roundScores: [],
      activeTab: 'home',
      viewTeam: 'you',
      viewPlayer: '',
      playerReturnTab: 'home',

      addPlayer: (id) => {
        const { myTeam, budget, phase, captain, viceCaptain } = get();
        if (phase !== 'draft') return; // squad is locked after the draft — use transfers
        if (myTeam.length >= SQUAD_SIZE) return;
        if (myTeam.includes(id)) return;
        const player = findPlayer(id);
        if (!player || budget < player.price) return;
        if (isPlayerOut(id, [])) return; // never draft an already-out (e.g. DNS) player — they'd never be refundable
        if (isTierFull(getTier(player.ranking), myTeam)) return; // tier quota already met (e.g. no 3rd Platinum)
        const newTeam = [...myTeam, id];
        set({ myTeam: newTeam, budget: budget - player.price, ...pickLeaders(newTeam, captain, viceCaptain, []) });
      },

      removePlayer: (id) => {
        const { myTeam, budget, captain, viceCaptain, phase } = get();
        if (phase !== 'draft') return; // squad is locked after the draft
        if (!myTeam.includes(id)) return; // not owned → nothing to refund (guards a double-tap of ✕)
        const player = findPlayer(id);
        if (!player) return;
        const newTeam = myTeam.filter(pid => pid !== id);
        set({
          myTeam: newTeam,
          budget: budget + player.price,
          // clear the removed player from a leader slot, then re-field two leaders
          ...pickLeaders(newTeam, captain === id ? null : captain, viceCaptain === id ? null : viceCaptain, []),
        });
      },

      setCaptain: (id) => {
        const { myTeam, captain, viceCaptain, currentRoundIndex, phase, captainHistory, viceCaptainHistory } = get();
        // Captaining only makes sense while choosing a squad or a round's captain.
        if (phase !== 'draft' && phase !== 'pre_round') return;
        const round = ROUNDS[currentRoundIndex]?.id;
        // P1: once the round has a result the captain is frozen (the server rejects a change).
        if (phase === 'pre_round' && round && roundHasResult(round)) { warnLeaderLocked(currentRoundIndex); return; }
        if (!myTeam.includes(id)) return;
        // An eliminated player can't captain (guards callers that don't pre-filter).
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (isPlayerOut(id, revealed)) return;
        if (id === captain) return;
        // Promoting your vice swaps the two roles; a bench player drops the old captain
        // to the bench. Either way there are still exactly two on-court leaders.
        const newVice = id === viceCaptain ? captain : viceCaptain;
        const hist = phase === 'pre_round' ? recordLeaders(round, id, newVice, captainHistory, viceCaptainHistory) : {};
        set({ captain: id, viceCaptain: newVice, ...hist });
      },

      setViceCaptain: (id) => {
        const { myTeam, captain, viceCaptain, currentRoundIndex, phase, captainHistory, viceCaptainHistory } = get();
        if (phase !== 'draft' && phase !== 'pre_round') return;
        const round = ROUNDS[currentRoundIndex]?.id;
        if (phase === 'pre_round' && round && roundHasResult(round)) { warnLeaderLocked(currentRoundIndex); return; }
        if (!myTeam.includes(id)) return;
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (isPlayerOut(id, revealed)) return;
        if (id === viceCaptain) return;
        const newCap = id === captain ? viceCaptain : captain;
        const hist = phase === 'pre_round' ? recordLeaders(round, newCap, id, captainHistory, viceCaptainHistory) : {};
        set({ viceCaptain: id, captain: newCap, ...hist });
      },

      // Send a captain/vice back to the bench, leaving the slot BLANK (no auto-fill)
      // so the manager can deliberately choose who fills it.
      benchLeader: (id) => {
        const { captain, viceCaptain, currentRoundIndex, phase, captainHistory, viceCaptainHistory } = get();
        if (phase !== 'draft' && phase !== 'pre_round') return;
        const round = ROUNDS[currentRoundIndex]?.id;
        if (phase === 'pre_round' && round && roundHasResult(round)) { warnLeaderLocked(currentRoundIndex); return; }
        let newCap = captain, newVice = viceCaptain;
        if (id === captain) newCap = null;
        else if (id === viceCaptain) newVice = null;
        else return;
        const hist = phase === 'pre_round' ? recordLeaders(round, newCap, newVice, captainHistory, viceCaptainHistory) : {};
        set({ captain: newCap, viceCaptain: newVice, ...hist });
      },

      // Re-field two on-court leaders after a state restore (cloud / localStorage),
      // so a squad hydrated from an older save always shows a captain + vice.
      ensureLeaders: () => {
        const { myTeam, captain, viceCaptain, currentRoundIndex, phase } = get();
        if (phase !== 'draft' && phase !== 'pre_round') return;
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        set(pickLeaders(myTeam, captain, viceCaptain, revealed));
      },

      finalizeDraft: () => {
        const { myTeam, captain, viceCaptain, phase } = get();
        if (phase !== 'draft') return; // already locked in
        if (tournamentStarted()) return; // P6: the draft is closed once the tournament has a result
        // The full composition rule (10 · 2 Platinum · 3 Gold · 5 Silver) is enforced
        // at the UI (the Lock button is gated on isSquadValid). The store stays
        // permissive so unit tests can lock a small squad to isolate scoring; no
        // production caller ever passes an illegal squad.
        if (myTeam.length === 0) return;
        // Snapshot the drafted squad; keep the two leaders (they're kept defaulted).
        const leaders = pickLeaders(myTeam, captain, viceCaptain, []);
        const { captainHistory, viceCaptainHistory } = get();
        // Commit R64's captain-of-record now (while it's still open) so the server accepts
        // it and the board applies the multiplier; a no-op if R64 already has a result.
        set({
          phase: 'pre_round', ...leaders, initialSquad: [...myTeam],
          ...recordLeaders(ROUNDS[0].id, leaders.captain, leaders.viceCaptain, captainHistory, viceCaptainHistory),
        });
        track('squad_locked', { size: myTeam.length, spend: STARTING_BUDGET - get().budget });
      },

      // Mid-tournament substitution: swap an eliminated squad member for a
      // still-alive player you can now afford (with the returned budget).
      replacePlayer: (oldId, newId) => {
        const { myTeam, budget, captain, viceCaptain, currentRoundIndex, phase } = get();
        if (phase === 'finished' || phase === 'draft') return;
        if (!transfersOpen(currentRoundIndex)) return; // window shut after the QF
        // P6: can't transfer into a round that's already under way — the swap first scores the
        // current round, so once it has a result the move would be retroactive (server rejects it).
        if (roundHasResult(ROUNDS[currentRoundIndex]?.id)) return;
        if (!myTeam.includes(oldId) || myTeam.includes(newId)) return;
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (!isPlayerOut(oldId, revealed)) return; // old player isn't eliminated yet
        if (isPlayerOut(newId, revealed)) return;  // replacement already knocked out
        const player = findPlayer(newId);
        if (!player || budget < player.price) return;         // unknown id or can't afford
        // Enforce the tier quota on the resulting squad — a swap must never create a
        // 3rd Platinum (etc.). Same-tier swaps always pass; a cross-tier swap is
        // rejected when the incoming tier is already full among the players you keep.
        if (isTierFull(getTier(player.ranking), myTeam.filter(id => id !== oldId))) return;
        // Log the move against the round just played, for the transfer history.
        const round = ROUNDS[currentRoundIndex - 1]?.id ?? ROUNDS[0].id;
        set({
          myTeam: myTeam.map(id => (id === oldId ? newId : id)),
          budget: round1(budget - player.price), // round like every other money mutation — budget can be fractional after refunds
          captain: captain === oldId ? null : captain,
          viceCaptain: viceCaptain === oldId ? null : viceCaptain,
          transfers: [...get().transfers, { out: oldId, in: newId, round }],
        });
        track('transfer_made', { out: oldId, in: newId, round });
      },

      playNextRound: () => {
        const { currentRoundIndex, myTeam, captainHistory, viceCaptainHistory, budgetReturns, myScore, roundScores, phase } = get();
        if (currentRoundIndex >= ROUNDS.length) return;
        // Only playable from pre_round. Guards a double-tap that would otherwise
        // burn the next round with no captain and skip its transfer window.
        if (phase !== 'pre_round') return;
        // Live mode: refuse to score a round the real tournament hasn't finished.
        // (Always true in replay mode — the baked draw is complete.)
        if (!roundPlayable(currentRoundIndex)) return;

        const round = ROUNDS[currentRoundIndex];
        const roundMatches = getMatchesForRound(round.id);
        // The captain/vice OF RECORD for this round — committed during pre_round while the
        // round was still open (recordLeaders). Empty if the manager only arrived after the
        // round already had results → no multiplier here, matching the server's strict lock.
        // We score off this, NOT the transient captain field, so local == authoritative board.
        const roundCap = captainHistory.find(c => c.round === round.id)?.playerId ?? null;
        const roundVice = viceCaptainHistory.find(c => c.round === round.id)?.playerId ?? null;

        // Calculate points
        let roundPoints = 0;
        let captainBonus = 0;
        let viceBonus = 0;
        const newReturns: BudgetReturn[] = [];

        myTeam.forEach(playerId => {
          const match = roundMatches.find(m => m.p1Id === playerId || m.p2Id === playerId);
          // No match this round → already eliminated in an earlier round (and
          // refunded then). Nothing to score.
          if (!match) return;

          const won = match.winnerId === playerId;
          if (won) {
            const oppId = match.p1Id === playerId ? match.p2Id : match.p1Id;
            const pts = winPoints(round.id, playerId, oppId); // ranking-weighted + upset bonus
            if (playerId === roundCap) {
              const total = pts * CAPTAIN_MULTIPLIER;
              captainBonus += total - pts; // +pts extra (total 2×)
              roundPoints += total;
            } else if (playerId === roundVice) {
              const total = pts * VICE_MULTIPLIER; // ×1.5 unrounded → half-points allowed (1 → 1.5)
              viceBonus += total - pts; // +half extra (total 1.5×)
              roundPoints += total;
            } else {
              roundPoints += pts;
            }
          } else {
            // Player lost THIS round → eliminated now; refund by this round's rate.
            const player = findPlayer(playerId);
            if (!player) return;
            const returnAmt = round1(player.price * BUDGET_RETURN_RATES[round.id]);
            if (returnAmt > 0) newReturns.push({ playerId, round: round.id, amount: returnAmt });
          }
        });

        const totalReturn = newReturns.reduce((sum, r) => sum + r.amount, 0);
        const isLastRound = currentRoundIndex === ROUNDS.length - 1;

        // captainHistory/viceCaptainHistory are NOT written here — the captain-of-record was
        // already committed during pre_round (recordLeaders), before this round had results.
        // Clearing captain/vice readies the next round's fresh pick.
        set({
          myScore: myScore + roundPoints,
          roundScores: [...roundScores, { round: round.id, points: roundPoints, captainBonus, viceBonus }],
          budgetReturns: [...budgetReturns, ...newReturns],
          budget: round1(get().budget + totalReturn),
          currentRoundIndex: currentRoundIndex + 1,
          captain: null,
          viceCaptain: null,
          phase: isLastRound ? 'finished' : 'round_complete',
        });
        track('round_played', { round: round.id, points: roundPoints, finished: isLastRound });
      },

      // Move from the results screen to captain-picking for the next round. Guarded
      // so it can only advance from round_complete (never re-open a finished game).
      continueToNextRound: () => {
        const { phase, myTeam, currentRoundIndex, captainHistory, viceCaptainHistory } = get();
        if (phase !== 'round_complete') return;
        // Re-field two leaders by default (best-ranked still-alive members) so a
        // manager who doesn't touch the captaincy still gets ×2 / ×1.5 each round.
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        const leaders = pickLeaders(myTeam, null, null, revealed);
        // Commit this round's default captain-of-record while it's still open. If the
        // round already has a result (a manager returning late), it's a no-op → no
        // multiplier this round, exactly as the server would enforce.
        set({
          phase: 'pre_round', ...leaders,
          ...recordLeaders(ROUNDS[currentRoundIndex]?.id, leaders.captain, leaders.viceCaptain, captainHistory, viceCaptainHistory),
        });
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      openTeam: (teamId) => set({ viewTeam: teamId, activeTab: 'team' }),

      openPlayer: (playerId) => { track('player_viewed', { playerId }); set(s => ({
        viewPlayer: playerId,
        playerReturnTab: s.activeTab === 'player' ? s.playerReturnTab : s.activeTab,
        activeTab: 'player',
      })); },

      resetGame: () => set({
        phase: 'draft',
        myTeam: [],
        initialSquad: [],
        transfers: [],
        captain: null,
        viceCaptain: null,
        captainHistory: [],
        viceCaptainHistory: [],
        budget: STARTING_BUDGET,
        budgetReturns: [],
        currentRoundIndex: 0,
        myScore: 0,
        roundScores: [],
        activeTab: 'home',
        viewTeam: 'you',
        viewPlayer: '',
        playerReturnTab: 'home',
      }),
    }),
    {
      // Scope the save PER TOURNAMENT (like the live store) so a squad/score from one
      // event never bleeds into the next — switching the active tournament starts a
      // clean slate rather than rehydrating the previous event's state.
      name: `grand-slam-gm-${ACTIVE_TOURNAMENT_ID}`,
      version: 3,
      // Persist only game data — never the transient navigation state (activeTab /
      // viewTeam / viewPlayer / playerReturnTab), so a reload always lands on Home
      // rather than restoring a deep player/team detail view.
      partialize: (s) => ({
        phase: s.phase, myTeam: s.myTeam, initialSquad: s.initialSquad, transfers: s.transfers,
        captain: s.captain, viceCaptain: s.viceCaptain,
        captainHistory: s.captainHistory, viceCaptainHistory: s.viceCaptainHistory, budget: s.budget,
        budgetReturns: s.budgetReturns, currentRoundIndex: s.currentRoundIndex,
        myScore: s.myScore, roundScores: s.roundScores,
      }),
      // Drop any persisted player id that no longer exists in the roster (so a
      // rehydrated squad can never dereference an undefined player and crash), and
      // re-derive a stale draft budget after roster/price changes.
      migrate: (persisted) => {
        const s = persisted as Partial<GameStore> | undefined;
        if (s) sanitizeState(s);
        return s as GameStore;
      },
      // Runs on EVERY rehydrate (migrate only runs on a version bump). Belt-and-
      // suspenders: the same sanitize the cloud restore uses (see sanitizeState).
      onRehydrateStorage: () => (state) => {
        if (state) sanitizeState(state);
      },
    }
  )
);

// Squad members who have been eliminated (their exit round is revealed).
export function eliminatedSquad(myTeam: string[], currentRoundIndex: number) {
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
  return myTeam.filter(id => isPlayerOut(id, revealed));
}

// Still-alive players you don't own and can afford — valid substitutes.
export function substitutionCandidates(myTeam: string[], budget: number, currentRoundIndex: number) {
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
  const alive = (id: string) => !isPlayerOut(id, revealed);
  return PLAYERS
    .filter(p => !myTeam.includes(p.id) && alive(p.id) && p.price <= budget)
    .sort((a, b) => b.price - a.price);
}

// Selectors
export const selectCurrentRound = (s: GameStore) =>
  s.currentRoundIndex < ROUNDS.length ? ROUNDS[s.currentRoundIndex] : null;

export const selectRoundMatches = (round: RoundId) =>
  getMatchesForRound(round);

export const selectEliminatedPlayers = (myTeam: string[], revealedRounds: RoundId[]) =>
  myTeam.filter(id => isPlayerOut(id, revealedRounds));

export const selectActivePlayers = (myTeam: string[], currentRoundIndex: number) => {
  const playedRounds = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
  return myTeam.filter(id => !isPlayerOut(id, playedRounds));
};

