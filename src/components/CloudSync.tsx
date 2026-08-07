import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfile, markTournamentJoined } from '../store/profileStore';
import { useGameStore, sanitizeState } from '../store/gameStore';
import { useSync } from '../store/syncStore';
import { toast } from '../store/toastStore';
import { TOURNAMENT } from '../data/tournamentConfig';
import { PLAYERS } from '../data/players';
import { validateSquadLegality, type RosterPricing } from '../data/entryValidation';
import {
  fetchProfile, saveProfile, type CloudProfile,
  publicLeagueId, fetchEntry, saveEntry, type EntryWrite,
} from '../data/cloud';

// Client-side roster for PRE-validation (same rules the server RPC enforces) — catches an
// illegal squad before the round-trip and surfaces the reason instantly.
const ROSTER: Map<string, RosterPricing> = new Map(PLAYERS.map(p => [p.id, { id: p.id, price: p.price, ranking: p.ranking }]));

// ── Cloud sync (mounted once, renders nothing) ───────────────────────────────
// Keeps the signed-in user's profile in sync with Supabase. Guests are untouched
// (no user → the effects bail), so offline play is unchanged.
//
// On login: pull the cloud profile and merge it with whatever is on this device —
// a value the cloud already has wins (cross-device), otherwise the local value is
// kept and pushed up (so anything entered while playing as a guest isn't lost).
// After that: debounce-save profile edits back to the cloud.

// Cross-device sync uses a persisted "this device has edits it never saved" flag rather
// than a timestamp comparison. Timestamps were unreliable ACROSS devices: each device
// stamped `updated_at` with its OWN clock, so clock skew let a laptop wrongly decide its
// stale copy was "newer" than the phone's real save — the reported bug where the captain
// / vice reverted to a previous value on another device. The flag has no such ambiguity:
//   • a real local edit sets it (unsaved changes live only on this device)
//   • a successful cloud save clears it (this device is now in sync with the cloud)
// On hydrate the cloud (the shared source of truth) wins UNLESS this flag is set.
const DIRTY_KEY = `gsgm-dirty-${TOURNAMENT.id}`;
const markSaved = () => {
  try { localStorage.setItem(`gsgm-entry-ts-${TOURNAMENT.id}`, String(Date.now())); localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
};
const markLocalDirty = () => { try { localStorage.setItem(DIRTY_KEY, '1'); } catch { /* ignore */ } };
const hasLocalUnsaved = () => { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; } };
const clearLocalDirty = () => { try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ } };

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
    phase: s.phase, myTeam: s.myTeam, initialSquad: s.initialSquad, transfers: s.transfers, cashedIn: s.cashedIn,
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
  // True only while WE apply the cloud snapshot, so the store subscription below can tell
  // a cloud restore apart from a real user edit (a restore must not flag "unsaved").
  const applyingCloud = useRef(false);
  // The optimistic-concurrency rev we last read/wrote for this entry (F2). Every save guards
  // on it; a conflict means another tab/device advanced it, and we re-fetch to converge.
  const entryRev = useRef(0);
  // Serialize saves: a second doSave() while one is in flight would share the same entryRev and,
  // if the first advances the server rev, the second 409s → revertToCloud() clobbers the newer
  // local edit (last-write-lost). Instead coalesce: mark a re-save and let the running one flush it.
  const saveInFlight = useRef(false);
  const resaveQueued = useRef(false);

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
      // tourSeen comes from the account (profiles.tour_seen_at), so the first-run tour is per-user
      // and never re-shows on a new device / after a cache clear.
      local.set({ ...merged, tourSeen: !!cloud?.tour_seen_at, hydrated: true });
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
  // played as a guest is lost. Always flips profile.entryHydrated so the onboarding
  // gate (App) knows the cloud verdict is in — and a returning player who already has
  // a cloud entry is marked "joined" so the Join gate is never shown to them again.
  useEffect(() => {
    if (!user) { gameHydratedFor.current = null; return; }
    if (gameHydratedFor.current === user.id) return;
    let cancelled = false;
    // Hard timeout: Supabase fetches over a flaky mobile network can hang without ever
    // rejecting, which would strand the user on the gate's "Loading…" forever. If the
    // hydrate doesn't settle in 8s, resolve the gate defensively (entryLoadFailed
    // suppresses the destructive reset) so the app always renders.
    const bail = window.setTimeout(() => {
      if (!cancelled && gameHydratedFor.current !== user.id) {
        gameHydratedFor.current = user.id;
        useProfile.getState().set({ entryLoadFailed: true, entryHydrated: true });
      }
    }, 8000);
    (async () => {
      try {
        const lid = await publicLeagueId();
        if (cancelled || !lid) return; // accounts not configured / no public league
        const entry = await fetchEntry(user.id, lid, TOURNAMENT.id); // throws on load failure
        if (cancelled) return;
        const hasCloud = entry && entry.state && Object.keys(entry.state).length > 0;
        // Cloud is the shared source of truth: apply it on every fresh load so a change
        // made on one device (e.g. a new captain/vice on the phone) always shows up on the
        // others. The ONLY reason to keep local instead is unsaved local edits this device
        // never managed to push (the dirty flag) — those we keep and push up so nothing
        // made offline is lost. `localEmpty` covers a brand-new device restoring from cloud.
        const localEmpty = useGameStore.getState().myTeam.length === 0;
        const localHasUnsaved = hasLocalUnsaved();
        if (hasCloud && (localEmpty || !localHasUnsaved)) {
          // Sanitize BEFORE applying: the cloud snapshot can hold ids removed from the
          // roster since it was saved, an out-of-range round index, or an eliminated
          // leader — sanitizeState drops/repairs all of that (same path as localStorage),
          // re-derives the draft budget, and re-fields two alive leaders.
          const restored = { ...entry!.state } as Partial<ReturnType<typeof useGameStore.getState>>;
          sanitizeState(restored);
          applyingCloud.current = true;
          useGameStore.setState(restored);              // restore this device from cloud
          applyingCloud.current = false;
          entryRev.current = entry!.rev;                // adopt the cloud rev as our save base
          clearLocalDirty();                            // local now equals the cloud
          useSync.getState().setStatus('saved');        // in sync with the cloud
          markTournamentJoined(TOURNAMENT.id);          // they already have an entry → already joined
        } else if (hasCloud) {
          markTournamentJoined(TOURNAMENT.id);          // entry exists → joined; keep newer local, push it up
          entryRev.current = entry!.rev;                // guard the push-up on the cloud's current rev
          const r = await saveEntry(user.id, lid, TOURNAMENT.id, gameSnapshot(), entryRev.current);
          if (r.ok) { entryRev.current = r.rev; markSaved(); }
        } else if (useGameStore.getState().myTeam.length > 0) {
          const r = await saveEntry(user.id, lid, TOURNAMENT.id, gameSnapshot(), entryRev.current); // first push-up (insert)
          if (r.ok) { entryRev.current = r.rev; markSaved(); }
        }
      } catch (err) {
        // We could NOT determine the cloud entry. Suppress the onboarding gate (whose
        // fresh-start reset would overwrite a squad we merely failed to load); a reload
        // re-attempts the fetch. Never treat "load failed" as "brand-new player".
        if (!cancelled) { console.warn('[cloud] game-entry hydrate failed:', err); useProfile.getState().set({ entryLoadFailed: true }); }
      } finally {
        // Always resolve the gate so a signed-in user can never get stuck on "Loading…".
        if (!cancelled) { window.clearTimeout(bail); gameHydratedFor.current = user.id; useProfile.getState().set({ entryHydrated: true }); }
      }
    })();
    return () => { cancelled = true; window.clearTimeout(bail); };
  }, [user]);

  // Save the current squad to the cloud NOW, driving the visible save status. Used by
  // both the debounce below and the manual Save button (via useSync.saveNow).
  const doSave = useCallback(async () => {
    if (!user || gameHydratedFor.current !== user.id) return;
    // Never overlap: if a save is already running, queue exactly one re-save of the LATEST state
    // and let the in-flight save flush it when it finishes (prevents the last-write-lost 409 race).
    if (saveInFlight.current) { resaveQueued.current = true; return; }
    saveInFlight.current = true;
    try {
    useSync.getState().setStatus('saving');
    // Pre-validate with the SAME rules the server enforces — fail fast, no round-trip.
    const st = useGameStore.getState();
    const illegal = validateSquadLegality(
      { squad: st.myTeam, phase: st.phase, hasTransfers: (st.transfers?.length ?? 0) > 0, hasCashedIn: (st.cashedIn?.length ?? 0) > 0 }, ROSTER,
    );
    if (illegal) { toast(illegal, 'warn'); useSync.getState().setStatus('error'); return; }
    try {
      const lid = await publicLeagueId();
      if (!lid) { useSync.getState().setStatus('error'); return; }
      // Roll local state back to the server's stored truth — used when the server REJECTS a
      // write or another device won a race. Returns false if there's no cloud row to revert
      // to, in which case the local state is the only truth and there's nothing to undo.
      const revertToCloud = async (): Promise<boolean> => {
        const entry = await fetchEntry(user.id, lid, TOURNAMENT.id);
        if (!entry || !entry.state || Object.keys(entry.state).length === 0) return false;
        const restored = { ...entry.state } as Partial<ReturnType<typeof useGameStore.getState>>;
        sanitizeState(restored);
        applyingCloud.current = true; useGameStore.setState(restored); applyingCloud.current = false;
        entryRev.current = entry.rev; clearLocalDirty();
        return true;
      };
      const res = await saveEntry(user.id, lid, TOURNAMENT.id, gameSnapshot(), entryRev.current);
      if (res.ok) {
        entryRev.current = res.rev; markSaved(); useSync.getState().setStatus('saved');
      } else if (res.invalid) {
        // The server rejected this edit (e.g. a captain change after its round locked). Undo
        // the optimistic local change instead of leaving it on screen to silently revert on
        // reload (P1/P4). After a successful revert local == server, so we're back in sync.
        const reverted = await revertToCloud();
        toast(res.invalid, 'warn');
        useSync.getState().setStatus(reverted ? 'saved' : 'error');
      } else if (res.conflict) {
        // Another tab/device saved first. Converge on the cloud copy (both devices agree)
        // rather than blindly overwriting it — the honest resolution for two live editors.
        if (await revertToCloud()) { useSync.getState().setStatus('saved'); toast('Squad updated from another device', 'info'); }
        else { useSync.getState().setStatus('error'); }
      } else {
        useSync.getState().setStatus('error');
      }
    } catch { useSync.getState().setStatus('error'); }
    } finally {
      saveInFlight.current = false;
      // A save was requested while this one ran → flush the latest state now.
      if (resaveQueued.current) { resaveQueued.current = false; void doSave(); }
    }
  }, [user]);

  // Expose an immediate save for the Save button.
  useEffect(() => { useSync.getState().setSaveNow(() => { void doSave(); }); }, [doSave]);

  // Watch the persisted game state. A real USER edit (incl. captain/vice — which the old
  // field-list deps missed) flags the squad "unsaved" and debounces a save; a cloud
  // restore (applyingCloud) is ignored so it never shows as unsaved.
  useEffect(() => {
    const snap = (s: ReturnType<typeof useGameStore.getState>) => JSON.stringify([
      s.myTeam, s.captain, s.viceCaptain, s.phase, s.currentRoundIndex,
      s.budget, s.transfers, s.captainHistory, s.roundScores,
    ]);
    let prev = snap(useGameStore.getState());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useGameStore.subscribe((state) => {
      const cur = snap(state);
      if (cur === prev) return;
      prev = cur;
      if (applyingCloud.current || !user || gameHydratedFor.current !== user.id) return;
      markLocalDirty();               // persist "unsaved local edits" across reloads (see DIRTY_KEY)
      useSync.getState().markDirty();
      clearTimeout(timer);
      timer = setTimeout(() => { void doSave(); }, 1000);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [user, doSave]);

  return null;
}
