import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GamePhase, RoundId, RoundScore, BudgetReturn, Transfer } from '../types';
import {
  ROUNDS, getMatchesForRound, isPlayerOut, BUDGET_RETURN_RATES, winPoints, transfersOpen, roundPlayable,
} from '../data/tournament';
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
  const valid = (id: string | null): id is string => !!id && team.includes(id);
  let cap = valid(captain) ? captain : null;
  let vc = valid(vice) && vice !== cap ? vice : null;
  const byRank = team
    .filter(id => !isPlayerOut(id, revealed))
    .sort((a, b) => (findPlayer(a)?.ranking ?? 9999) - (findPlayer(b)?.ranking ?? 9999));
  if (!cap) cap = byRank.find(id => id !== vc) ?? null;
  if (!vc) vc = byRank.find(id => id !== cap) ?? null;
  return { captain: cap, viceCaptain: vc };
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
        const { myTeam, captain, viceCaptain, currentRoundIndex, phase } = get();
        // Captaining only makes sense while choosing a squad or a round's captain.
        if (phase !== 'draft' && phase !== 'pre_round') return;
        if (!myTeam.includes(id)) return;
        // An eliminated player can't captain (guards callers that don't pre-filter).
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (isPlayerOut(id, revealed)) return;
        if (id === captain) return;
        // Promoting your vice swaps the two roles; a bench player drops the old captain
        // to the bench. Either way there are still exactly two on-court leaders.
        set({ captain: id, viceCaptain: id === viceCaptain ? captain : viceCaptain });
      },

      setViceCaptain: (id) => {
        const { myTeam, captain, viceCaptain, currentRoundIndex, phase } = get();
        if (phase !== 'draft' && phase !== 'pre_round') return;
        if (!myTeam.includes(id)) return;
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (isPlayerOut(id, revealed)) return;
        if (id === viceCaptain) return;
        set({ viceCaptain: id, captain: id === captain ? viceCaptain : captain });
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
        // The full composition rule (10 · 2 Platinum · 3 Gold · 5 Silver) is enforced
        // at the UI (the Lock button is gated on isSquadValid). The store stays
        // permissive so unit tests can lock a small squad to isolate scoring; no
        // production caller ever passes an illegal squad.
        if (myTeam.length === 0) return;
        // Snapshot the drafted squad; keep the two leaders (they're kept defaulted).
        set({ phase: 'pre_round', ...pickLeaders(myTeam, captain, viceCaptain, []), initialSquad: [...myTeam] });
      },

      // Mid-tournament substitution: swap an eliminated squad member for a
      // still-alive player you can now afford (with the returned budget).
      replacePlayer: (oldId, newId) => {
        const { myTeam, budget, captain, viceCaptain, currentRoundIndex, phase } = get();
        if (phase === 'finished' || phase === 'draft') return;
        if (!transfersOpen(currentRoundIndex)) return; // window shut after the QF
        if (!myTeam.includes(oldId) || myTeam.includes(newId)) return;
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (!isPlayerOut(oldId, revealed)) return; // old player isn't eliminated yet
        if (isPlayerOut(newId, revealed)) return;  // replacement already knocked out
        const player = findPlayer(newId);
        if (!player || budget < player.price) return;         // unknown id or can't afford
        // Log the move against the round just played, for the transfer history.
        const round = ROUNDS[currentRoundIndex - 1]?.id ?? ROUNDS[0].id;
        set({
          myTeam: myTeam.map(id => (id === oldId ? newId : id)),
          budget: round1(budget - player.price), // round like every other money mutation — budget can be fractional after refunds
          captain: captain === oldId ? null : captain,
          viceCaptain: viceCaptain === oldId ? null : viceCaptain,
          transfers: [...get().transfers, { out: oldId, in: newId, round }],
        });
      },

      playNextRound: () => {
        const { currentRoundIndex, myTeam, captain, viceCaptain, captainHistory, viceCaptainHistory, budgetReturns, myScore, roundScores, phase } = get();
        if (currentRoundIndex >= ROUNDS.length) return;
        // Only playable from pre_round. Guards a double-tap that would otherwise
        // burn the next round with no captain and skip its transfer window.
        if (phase !== 'pre_round') return;
        // Live mode: refuse to score a round the real tournament hasn't finished.
        // (Always true in replay mode — the baked draw is complete.)
        if (!roundPlayable(currentRoundIndex)) return;

        const round = ROUNDS[currentRoundIndex];
        const roundMatches = getMatchesForRound(round.id);

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
            if (playerId === captain) {
              const total = pts * CAPTAIN_MULTIPLIER;
              captainBonus += total - pts; // +pts extra (total 2×)
              roundPoints += total;
            } else if (playerId === viceCaptain) {
              const total = Math.round(pts * VICE_MULTIPLIER);
              viceBonus += total - pts; // +half extra (total 1.5×, rounded)
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

        // Record who captained / vice-captained this round for the history.
        const newCaptainHistory = captain
          ? [...captainHistory, { round: round.id, playerId: captain }]
          : captainHistory;
        const newViceCaptainHistory = viceCaptain
          ? [...viceCaptainHistory, { round: round.id, playerId: viceCaptain }]
          : viceCaptainHistory;

        set({
          myScore: myScore + roundPoints,
          roundScores: [...roundScores, { round: round.id, points: roundPoints, captainBonus, viceBonus }],
          budgetReturns: [...budgetReturns, ...newReturns],
          budget: round1(get().budget + totalReturn),
          currentRoundIndex: currentRoundIndex + 1,
          captainHistory: newCaptainHistory,
          viceCaptainHistory: newViceCaptainHistory,
          captain: null,
          viceCaptain: null,
          phase: isLastRound ? 'finished' : 'round_complete',
        });
      },

      // Move from the results screen to captain-picking for the next round. Guarded
      // so it can only advance from round_complete (never re-open a finished game).
      continueToNextRound: () => {
        const { phase, myTeam, currentRoundIndex } = get();
        if (phase !== 'round_complete') return;
        // Re-field two leaders by default (best-ranked still-alive members) so a
        // manager who doesn't touch the captaincy still gets ×2 / ×1.5 each round.
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        set({ phase: 'pre_round', ...pickLeaders(myTeam, null, null, revealed) });
      },

      setActiveTab: (tab) => set({ activeTab: tab }),

      openTeam: (teamId) => set({ viewTeam: teamId, activeTab: 'team' }),

      openPlayer: (playerId) => set(s => ({
        viewPlayer: playerId,
        playerReturnTab: s.activeTab === 'player' ? s.playerReturnTab : s.activeTab,
        activeTab: 'player',
      })),

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
      name: 'grand-slam-gm-v1',
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
        if (s) {
          const ids = new Set(PLAYERS.map(p => p.id));
          const priceById = new Map(PLAYERS.map(p => [p.id, p.price]));
          if (Array.isArray(s.myTeam)) s.myTeam = s.myTeam.filter(id => ids.has(id));
          if (Array.isArray(s.initialSquad)) s.initialSquad = s.initialSquad.filter(id => ids.has(id));
          if (Array.isArray(s.transfers)) s.transfers = s.transfers.filter(t => ids.has(t.in) && ids.has(t.out));
          if (s.captain && !ids.has(s.captain)) s.captain = null;
          if (s.viceCaptain && !ids.has(s.viceCaptain)) s.viceCaptain = null;
          if (s.viewPlayer && !ids.has(s.viewPlayer)) s.viewPlayer = '';
          if (Array.isArray(s.budgetReturns)) s.budgetReturns = s.budgetReturns.filter(r => ids.has(r.playerId));
          if (Array.isArray(s.captainHistory)) s.captainHistory = s.captainHistory.filter(c => ids.has(c.playerId));
          if (Array.isArray(s.viceCaptainHistory)) s.viceCaptainHistory = s.viceCaptainHistory.filter(c => ids.has(c.playerId));
          // During the draft, budget is exactly 100 − squad cost; recompute it so a
          // squad carried over from an older price curve can't show the wrong budget.
          if (s.phase === 'draft' && Array.isArray(s.myTeam)) {
            const spent = s.myTeam.reduce((sum, id) => sum + (priceById.get(id) ?? 0), 0);
            s.budget = STARTING_BUDGET - spent;
          }
        }
        return s as GameStore;
      },
      // Runs on EVERY rehydrate (migrate only runs on a version bump): drop any
      // persisted player id that no longer exists in the roster, so a stale squad can
      // never dereference an undefined player and white-screen the app (the throwing
      // getPlayer() is used across the pages). Belt-and-suspenders to migrate().
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const ids = new Set(PLAYERS.map(p => p.id));
        if (Array.isArray(state.myTeam)) state.myTeam = state.myTeam.filter(id => ids.has(id));
        if (Array.isArray(state.initialSquad)) state.initialSquad = state.initialSquad.filter(id => ids.has(id));
        if (Array.isArray(state.transfers)) state.transfers = state.transfers.filter(t => ids.has(t.in) && ids.has(t.out));
        if (state.captain && !ids.has(state.captain)) state.captain = null;
        if (state.viceCaptain && !ids.has(state.viceCaptain)) state.viceCaptain = null;
        if (Array.isArray(state.budgetReturns)) state.budgetReturns = state.budgetReturns.filter(r => ids.has(r.playerId));
        if (Array.isArray(state.captainHistory)) state.captainHistory = state.captainHistory.filter(c => ids.has(c.playerId));
        if (Array.isArray(state.viceCaptainHistory)) state.viceCaptainHistory = state.viceCaptainHistory.filter(c => ids.has(c.playerId));
        // Re-field two on-court leaders (older saves may have one or none).
        if ((state.phase === 'draft' || state.phase === 'pre_round') && Array.isArray(state.myTeam)) {
          const revealed = ROUNDS.slice(0, state.currentRoundIndex ?? 0).map(r => r.id);
          const led = pickLeaders(state.myTeam, state.captain ?? null, state.viceCaptain ?? null, revealed);
          state.captain = led.captain; state.viceCaptain = led.viceCaptain;
        }
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

