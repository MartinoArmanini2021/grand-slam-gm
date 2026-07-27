import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfile } from '../store/profileStore';
import { fetchProfile, saveProfile, type CloudProfile } from '../data/cloud';

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

export default function CloudSync() {
  const { user } = useAuth();
  // Subscribe to the fields we sync so edits trigger a save.
  const { username, firstName, lastName, country, teamName, teamEmblem } = useProfile();
  const hydratedFor = useRef<string | null>(null);

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

  return null;
}
