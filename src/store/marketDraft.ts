import { create } from 'zustand';

// PENDING (staged, uncommitted) Market changes — the manager's cash-ins and buys before they hit
// "Lock Squad". Deliberately a standalone, NON-persisted store (not in gameStore's partialize, not
// in localStorage): it must survive an in-session tab switch / player-drilldown (which unmounts
// DraftPage) so pending work isn't silently lost — but it should NOT round-trip to the cloud or
// outlive a reload/sign-out. Cleared on commit, discard, and resetGame.
interface MarketDraft {
  cashIns: string[]; // squad players staged to Cash In
  buys: string[];    // players staged to Buy
  setCashIns: (ids: string[]) => void;
  setBuys: (ids: string[]) => void;
  clear: () => void;
}

export const useMarketDraft = create<MarketDraft>(set => ({
  cashIns: [],
  buys: [],
  setCashIns: ids => set({ cashIns: ids }),
  setBuys: ids => set({ buys: ids }),
  clear: () => set({ cashIns: [], buys: [] }),
}));
