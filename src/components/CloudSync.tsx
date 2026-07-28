import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfile } from '../store/profileStore';
import { useGameStore } from '../store/gameStore';
import { TOURNAMENT } from '../data/tournamentConfig';
import { findPlayer } from '../data/players';
import { STARTING_BUDGET } from '../data/squadRules';
import { round1 } from '../data/format';
import {
  fetchProfile, saveProfile, type CloudProfile,
  publicLeagueId, fetchEntry, saveEntry, type EntryWrite,
} from '../data/cloud';

// ── Cloud sync (mounted once, renders nothing) ───────────────────────────────
// Keeps the signed-in user's profile in sync with Supabase. Guests are untouched
// (no user → the effects bail), so offline play is unchanged.
//
// On login: pull the cloud profile and merge it with whatever is on this device —
// a value the cloud already has wins (cross-device), otherwise the local value is
// kept and pushed up (so anything entered while playing as a guest isn't lost).
// After that: debounce-save profile edits back to the cloud.

const toCloud = (s: ReturnType<typeof useProfile.getState>): CloudProfile => ({
  username: s.username || null,
  first_name: s.firstName || null,
  last_name: s.lastName || null,
  country: s.country || null,
  team_name: s.teamName || null,
  team_emblem: s.teamEmblem || null,
});

// The persisted gameStore fields — the snapshot we store for device restore, and
// the shape we write back via setState on hydrate.
function gameSnapshot(): EntryWrite {
  const s = useGameStore.getState();
  const state = {
    phase: s.phase, myTeam: s.myTeam, initialSquad: s.initialSquad, transfers: s.transfers,
    captain: s.captain, viceCaptain: s.viceCaptain,
    captainHistory: s.captainHistory, viceCaptainHistory: s.viceCaptainHistory, budget: s.budget,
    budgetReturns: s.budgetReturns, currentRoundIndex: s.currentRoundIndex,
    myScore: s.myScore, roundScores: s.roundScores,
  };
  return {
    squad: s.myTeam, captainHistory: s.captainHistory, phase: s.phase,
    currentRoundIndex: s.currentRoundIndex, budget: s.budget, state,
  };
}

export default function CloudSync() {
  const { user } = useAuth();
  // Subscribe to the fields we sync so edits trigger a save.
  const { username, firstName, lastName, country, teamName, teamEmblem } = useProfile();
  const hydratedFor = useRef<string | null>(null);
  // Game-entry sync state.
  const gameHydratedFor = useRef<string | null>(null);
  const phase = useGameStore(s => s.phase);
  const myTeam = useGameStore(s => s.myTeam);
  const currentRoundIndex = useGameStore(s => s.currentRoundIndex);
  const captainHistory = useGameStore(s => s.captainHistory);
  const budget = useGameStore(s => s.budget);
  const transfers = useGameStore(s => s.transfers);
  const roundScores = useGameStore(s => s.roundScores);

  // Hydrate + merge on login.
  useEffect(() => {
    if (!user) { hydratedFor.current = null; return; }
    if (hydratedFor.current === user.id) return;
    let cancelled = false;
    (async () => {
      const cloud = await fetchProfile(user.id);
      if (cancelled) return;
      const local = useProfile.getState();
      // Cloud value wins when it's set to something real; else keep local.
      const pick = (c: string | null | undefined, l: string) => (c && c.trim() ? c : l);
      const merged = {
        username: pick(cloud?.username, local.username),
        firstName: pick(cloud?.first_name, local.firstName),
        lastName: pick(cloud?.last_name, local.lastName),
        country: pick(cloud?.country, local.country),
        // 'My Team' / 🎾 are defaults — treat them as "unset" so a real local name wins.
        teamName: cloud?.team_name && cloud.team_name !== 'My Team' ? cloud.team_name : local.teamName,
        teamEmblem: cloud?.team_emblem && cloud.team_emblem !== '🎾' ? cloud.team_emblem : local.teamEmblem,
      };
      local.set(merged);
      hydratedFor.current = user.id;
      // Push the merged result up so guest-entered data lands in the cloud.
      await saveProfile(user.id, toCloud(useProfile.getState()));
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Debounced save on edit (only after this user's hydrate has run).
  useEffect(() => {
    if (!user || hydratedFor.current !== user.id) return;
    const t = setTimeout(() => { void saveProfile(user.id, toCloud(useProfile.getState())); }, 800);
    return () => clearTimeout(t);
  }, [user, username, firstName, lastName, country, teamName, teamEmblem]);

  // Hydrate the game entry on login. Cloud state wins (cross-device); if the cloud
  // has no entry yet but this device has a squad in progress, push it up so nothing
  // played as a guest is lost.
  useEffect(() => {
    if (!user) { gameHydratedFor.current = null; return; }
    if (gameHydratedFor.current === user.id) return;
    let cancelled = false;
    (async () => {
      const lid = await publicLeagueId();
      if (!lid || cancelled) return;
      const entry = await fetchEntry(user.id, lid, TOURNAMENT.id);
      if (cancelled) return;
      const hasCloud = entry && entry.state && Object.keys(entry.state).length > 0;
      if (hasCloud) {
        useGameStore.setState(entry!.state);            // restore this device from cloud
        // Existing accounts may carry a budget from the old $100 / 8-player era; for
        // an in-progress draft, re-derive it from the squad + current price curve.
        const st = useGameStore.getState();
        if (st.phase === 'draft') {
          const spent = st.myTeam.reduce((sum, id) => sum + (findPlayer(id)?.price ?? 0), 0);
          useGameStore.setState({ budget: round1(STARTING_BUDGET - spent) });
        }
        useGameStore.getState().ensureLeaders(); // always field two on-court leaders
      } else if (useGameStore.getState().myTeam.length > 0) {
        await saveEntry(user.id, lid, TOURNAMENT.id, gameSnapshot()); // first push-up
      }
      gameHydratedFor.current = user.id;
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Debounced save of the game entry on any scoring-relevant change.
  useEffect(() => {
    if (!user || gameHydratedFor.current !== user.id) return;
    const t = setTimeout(async () => {
      const lid = await publicLeagueId();
      if (lid) await saveEntry(user.id, lid, TOURNAMENT.id, gameSnapshot());
    }, 1000);
    return () => clearTimeout(t);
  }, [user, phase, myTeam, currentRoundIndex, captainHistory, budget, transfers, roundScores]);

  return null;
}
