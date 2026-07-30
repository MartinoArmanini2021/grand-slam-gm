import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Local user + team profile. Persisted on-device for now; it will sync to the
// account record once the backend (Go-Live) is wired up.
interface ProfileState {
  firstName: string;
  lastName: string;
  username: string;
  country: string;
  email: string; // used when playing as a guest; the signed-in email takes precedence in the UI
  teamName: string;
  teamEmblem: string;
  // Tournament ids this user has explicitly JOINED (via the onboarding gate). Persisted
  // so a returning player skips the gate; a NEW tournament id is absent → they onboard
  // fresh (a clean squad each event). CloudSync also marks a tournament joined when the
  // cloud already holds an entry for it (so a returning player on a new device skips it).
  joinedTournaments: string[];
  hydrated: boolean; // true once CloudSync has loaded (or confirmed no) cloud profile — session-only, never persisted
  entryHydrated: boolean; // true once CloudSync has resolved the cloud game-entry (or there's no user) — session-only
  // True when CloudSync could NOT determine the cloud entry (network/query error). The
  // onboarding gate is then suppressed so its fresh-start reset can't overwrite a squad
  // we merely failed to load — a reload re-attempts the fetch. Session-only.
  entryLoadFailed: boolean;
  set: (patch: Partial<Omit<ProfileState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const DEFAULTS = {
  firstName: '', lastName: '', username: '', country: '', email: '',
  teamName: 'My Team', teamEmblem: '🎾', joinedTournaments: [] as string[],
} as const;

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      hydrated: false,
      entryHydrated: false,
      entryLoadFailed: false,
      set: (patch) => set(patch),
      reset: () => set({ ...DEFAULTS, hydrated: false, entryHydrated: false, entryLoadFailed: false }),
    }),
    {
      name: 'gsgm-profile',
      version: 2,
      partialize: (s) => ({
        firstName: s.firstName, lastName: s.lastName, username: s.username,
        country: s.country, email: s.email,
        teamName: s.teamName, teamEmblem: s.teamEmblem,
        joinedTournaments: s.joinedTournaments,
      }),
      // v1 saves have no joinedTournaments — default it so `.includes` never throws.
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<ProfileState>;
        if (!Array.isArray(s.joinedTournaments)) s.joinedTournaments = [];
        return s as ProfileState;
      },
    }
  )
);

// Has this user joined a given tournament? (Selector-friendly helper.)
export const hasJoined = (s: ProfileState, tournamentId: string) => s.joinedTournaments.includes(tournamentId);

// Mark a tournament joined (idempotent) — used by the onboarding gate and by CloudSync
// when it finds an existing cloud entry for the tournament.
export function markTournamentJoined(tournamentId: string): void {
  const s = useProfile.getState();
  if (s.joinedTournaments.includes(tournamentId)) return;
  s.set({ joinedTournaments: [...s.joinedTournaments, tournamentId] });
}
