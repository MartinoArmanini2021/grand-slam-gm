import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Local user profile. Persisted on-device for now; it will sync to the account
// record once the backend (Go-Live) is wired up.
interface ProfileState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string; // used when playing as a guest; the signed-in email takes precedence in the UI
  set: (patch: Partial<Omit<ProfileState, 'set'>>) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      set: (patch) => set(patch),
    }),
    {
      name: 'gsgm-profile',
      partialize: (s) => ({ firstName: s.firstName, lastName: s.lastName, phone: s.phone, email: s.email }),
    }
  )
);
