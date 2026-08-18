// ── DEV-ONLY UX harness ──────────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS. The app requires an account, and creating or signing into one is not something
// this environment can do. Without a way in, a UX audit of a signed-in product degenerates into
// reading source and guessing — which is exactly how you ship a redesign that looks fine in the
// code and is wrong on the screen.
//
// So: `?ux=<scenario>` seeds the stores and lets App render as if signed in. It exists to LOOK at
// real screens in real states — mid-draft, stuck, complete-but-unlocked, mid-round, finished.
//
// SAFETY. Every export is hard-gated on `import.meta.env.DEV`. Vite substitutes that literal at
// build time, so in a production build every call below is `false &&` and the whole module is
// dead-code-eliminated — the scenarios never reach the bundle, and `harnessUser()` can never return
// a user. This does NOT weaken the auth boundary: it fabricates a client-side user object for
// rendering only. It holds no token, so every Supabase call it makes is still an anonymous one that
// RLS refuses. Nothing here can read or write another person's data.

import { PLAYERS } from '../data/players';

export type Scenario =
  | 'empty'        // signed in, nothing picked — the true first-run draft screen
  | 'partial'      // mid-draft, a few players in
  | 'stuck'        // the 32828145 case: cannot afford a legal finish, and is not told
  | 'complete'     // the 88f692fa case: a legal 2/3/5 squad, all money spent, NOT locked
  | 'locked'       // locked and waiting for play to start
  | 'playing';     // locked, rounds scoring

const byTier = (tier: 'Platinum' | 'Gold' | 'Silver') =>
  PLAYERS.filter(p => (p.ranking <= 10 ? 'Platinum' : p.ranking <= 30 ? 'Gold' : 'Silver') === tier);

// Enabled in dev, AND in a build explicitly made with VITE_UX_HARNESS=1 (the ux-revamp preview).
// NOT in production: that build sets neither, so HARNESS is null and every branch below is dead.
// This exists because the first revamp deploy was unreviewable - every change was draft-time and
// Cincinnati draft closed on 15 August, so none of it could be reached from the live app.
const ENABLED = import.meta.env.DEV || import.meta.env.VITE_UX_HARNESS === '1';

export const HARNESS: Scenario | null = (() => {
  if (!ENABLED) return null;
  try {
    const v = new URL(window.location.href).searchParams.get('ux');
    return (v as Scenario) || null;
  } catch { return null; }
})();

// A fake signed-in user, for RENDERING ONLY. No token: every network call remains anonymous.
export const harnessUser = () =>
  ENABLED && HARNESS
    ? { id: '00000000-0000-4000-8000-00000000dev0', email: 'ux-harness@localhost' }
    : null;

// Seeds the game store for a scenario. Called once at boot, before the first render.
export function applyHarness(setGame: (s: Record<string, unknown>) => void): void {
  if (!ENABLED || !HARNESS) return;

  const plat = byTier('Platinum');
  const gold = byTier('Gold');
  const silv = byTier('Silver');
  const cheapest = (list: typeof PLAYERS, n: number) =>
    [...list].sort((a, b) => a.price - b.price).slice(0, n);
  const spend = (ids: string[]) =>
    150 - ids.reduce((t, id) => t + (PLAYERS.find(p => p.id === id)?.price ?? 0), 0);

  const legal = [
    ...cheapest(plat, 2), ...cheapest(gold, 3), ...cheapest(silv, 5),
  ].map(p => p.id);

  // The real dead end from production: 1 Platinum, 3 Gold, 3 Silver with too little left to finish.
  const stuckSquad = [
    ...cheapest(plat, 1), ...[...gold].sort((a, b) => b.price - a.price).slice(0, 3),
    ...[...silv].sort((a, b) => b.price - a.price).slice(0, 3),
  ].map(p => p.id);

  const base = { activeTab: 'home', viewPlayer: '', playerReturnTab: 'home' };

  switch (HARNESS) {
    case 'empty':
      setGame({ ...base, phase: 'draft', myTeam: [], initialSquad: [], budget: 150, captain: '', viceCaptain: '', transfers: [], cashedIn: [] });
      break;
    case 'partial': {
      const squad = [...cheapest(plat, 1), ...cheapest(gold, 2)].map(p => p.id);
      setGame({ ...base, phase: 'draft', myTeam: squad, initialSquad: [], budget: spend(squad), captain: squad[0], viceCaptain: squad[1], transfers: [], cashedIn: [] });
      break;
    }
    case 'stuck':
      setGame({ ...base, phase: 'draft', myTeam: stuckSquad, initialSquad: [], budget: 7, captain: stuckSquad[0], viceCaptain: stuckSquad[1], transfers: [], cashedIn: [] });
      break;
    case 'complete':
      setGame({ ...base, phase: 'draft', myTeam: legal, initialSquad: [], budget: 0, captain: legal[0], viceCaptain: legal[1], transfers: [], cashedIn: [] });
      break;
    case 'locked':
    case 'playing':
      setGame({ ...base, phase: 'pre_round', myTeam: legal, initialSquad: legal, budget: spend(legal), captain: legal[0], viceCaptain: legal[1], transfers: [], cashedIn: [] });
      break;
  }
}

// Scenarios that depict an OPEN draft. Cincinnati has results, so tournamentStarted() is true and
// the draft-time UI is unreachable on the live event — which made the whole revamp invisible. This
// lets those screens be SEEN without touching the persisted live results (which are real, and which
// the feed would refill anyway). Read only where draftClosed is computed.
export const HARNESS_OPEN_DRAFT: boolean =
  ENABLED && (HARNESS === 'empty' || HARNESS === 'partial' || HARNESS === 'stuck' || HARNESS === 'complete');
