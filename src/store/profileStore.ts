import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Local user + team profile. Persisted on-device for now; it will sync to the
// account record once the backend (Go-Live) is wired up.
interface ProfileState {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  country: string;
  email: string; // used when playing as a guest; the signed-in email takes precedence in the UI
  teamName: string;
  teamEmblem: string;
  set: (patch: Partial<Omit<ProfileState, 'set'>>) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      firstName: '',
      lastName: '',
      username: '',
      phone: '',
      country: '',
      email: '',
      teamName: 'My Team',
      teamEmblem: '🎾',
      set: (patch) => set(patch),
    }),
    {
      name: 'gsgm-profile',
      partialize: (s) => ({
        firstName: s.firstName, lastName: s.lastName, username: s.username,
        phone: s.phone, country: s.country, email: s.email,
        teamName: s.teamName, teamEmblem: s.teamEmblem,
      }),
    }
  )
);
