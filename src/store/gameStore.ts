import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GamePhase, RoundId, RoundScore, BudgetReturn } from '../types';
import {
  ROUNDS, MATCHES, getMatchesForRound, isPlayerOut, BUDGET_RETURN_RATES, winPoints, transfersOpen,
} from '../data/tournament';
import { getPlayer, PLAYERS } from '../data/players';

const STARTING_BUDGET = 100;
const TEAM_SIZE = 6;
const CAPTAIN_MULTIPLIER = 2;

interface GameStore {
  phase: GamePhase;
  myTeam: string[];
  captain: string | null;
  captainHistory: { round: RoundId; playerId: string }[];
  budget: number;
  budgetReturns: BudgetReturn[];
  currentRoundIndex: number;
  myScore: number;
  roundScores: RoundScore[];
  activeTab: 'home' | 'draft' | 'tournament' | 'team' | 'league' | 'player';
  viewTeam: string; // which team the detail view shows: 'you' or a rival id
  viewPlayer: string; // which player the profile page shows
  playerReturnTab: GameStore['activeTab']; // where the profile's back button returns to
  // Actions
  addPlayer: (id: string) => void;
  removePlayer: (id: string) => void;
  setCaptain: (id: string) => void;
  finalizeDraft: () => void;
  replacePlayer: (oldId: string, newId: string) => void;
  playNextRound: () => void;
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
      captain: null,
      captainHistory: [],
      budget: STARTING_BUDGET,
      budgetReturns: [],
      currentRoundIndex: 0,
      myScore: 0,
      roundScores: [],
      activeTab: 'draft',
      viewTeam: 'you',
      viewPlayer: '',
      playerReturnTab: 'home',

      addPlayer: (id) => {
        const { myTeam, budget } = get();
        if (myTeam.length >= TEAM_SIZE) return;
        if (myTeam.includes(id)) return;
        const player = getPlayer(id);
        if (!player || budget < player.price) return;
        set({ myTeam: [...myTeam, id], budget: budget - player.price });
      },

      removePlayer: (id) => {
        const { myTeam, budget, captain } = get();
        const player = getPlayer(id);
        if (!player) return;
        set({
          myTeam: myTeam.filter(pid => pid !== id),
          budget: budget + player.price,
          captain: captain === id ? null : captain,
        });
      },

      setCaptain: (id) => {
        const { myTeam } = get();
        if (!myTeam.includes(id)) return;
        set({ captain: id });
      },

      finalizeDraft: () => {
        const { myTeam, captain } = get();
        if (myTeam.length === 0) return;
        set({ phase: 'pre_round', captain: captain ?? myTeam[0] });
      },

      // Mid-tournament substitution: swap an eliminated squad member for a
      // still-alive player you can now afford (with the returned budget).
      replacePlayer: (oldId, newId) => {
        const { myTeam, budget, captain, currentRoundIndex, phase } = get();
        if (phase === 'finished' || phase === 'draft') return;
        if (!transfersOpen(currentRoundIndex)) return; // window shut after the QF
        if (!myTeam.includes(oldId) || myTeam.includes(newId)) return;
        const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
        if (!isPlayerOut(oldId, revealed)) return; // old player isn't eliminated yet
        if (isPlayerOut(newId, revealed)) return;  // replacement already knocked out
        const player = getPlayer(newId);
        if (!player || budget < player.price) return;         // can't afford
        set({
          myTeam: myTeam.map(id => (id === oldId ? newId : id)),
          budget: budget - player.price,
          captain: captain === oldId ? null : captain,
        });
      },

      playNextRound: () => {
        const { currentRoundIndex, myTeam, captain, captainHistory, budgetReturns, myScore, roundScores } = get();
        if (currentRoundIndex >= ROUNDS.length) return;

        const round = ROUNDS[currentRoundIndex];
        const roundMatches = getMatchesForRound(round.id);

        // Calculate points
        let roundPoints = 0;
        let captainBonus = 0;
        const newReturns: BudgetReturn[] = [];

        myTeam.forEach(playerId => {
          const match = roundMatches.find(m => m.p1Id === playerId || m.p2Id === playerId);
          if (!match) return;

          const won = match.winnerId === playerId;
          if (won) {
            const oppId = match.p1Id === playerId ? match.p2Id : match.p1Id;
            const pts = winPoints(round.id, playerId, oppId); // ranking-weighted + upset bonus
            if (playerId === captain) {
              captainBonus += pts; // +pts extra (total 2x)
              roundPoints += pts * CAPTAIN_MULTIPLIER;
            } else {
              roundPoints += pts;
            }
          } else {
            // Player lost THIS round → eliminated now; refund by this round's rate.
            const player = getPlayer(playerId);
            const returnAmt = Math.round(player.price * (BUDGET_RETURN_RATES[round.id] ?? 0) * 10) / 10;
            if (returnAmt > 0) newReturns.push({ playerId, round: round.id, amount: returnAmt });
          }
        });

        const totalReturn = newReturns.reduce((sum, r) => sum + r.amount, 0);
        const isLastRound = currentRoundIndex === ROUNDS.length - 1;

        // Store captain for this round
        const newCaptainHistory = captain
          ? [...captainHistory, { round: round.id, playerId: captain }]
          : captainHistory;

        set({
          myScore: myScore + roundPoints,
          roundScores: [...roundScores, { round: round.id, points: roundPoints, captainBonus }],
          budgetReturns: [...budgetReturns, ...newReturns],
          budget: get().budget + totalReturn,
          currentRoundIndex: currentRoundIndex + 1,
          captainHistory: newCaptainHistory,
          captain: null,
          phase: isLastRound ? 'finished' : 'round_complete',
        });
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
        captain: null,
        captainHistory: [],
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
    { name: 'grand-slam-gm-v1' }
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

export const selectRevealedRounds = (currentRoundIndex: number, phase: GamePhase): RoundId[] => {
  const count = phase === 'draft' || phase === 'pre_round'
    ? currentRoundIndex
    : currentRoundIndex;
  return ROUNDS.slice(0, count).map(r => r.id);
};

export const MATCHES_DATA = MATCHES;
