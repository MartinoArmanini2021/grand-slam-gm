import { create } from 'zustand';

// Tracks whether the player's squad is saved to the cloud, so the UI can show an honest
// Save button (Saved ✓ / unsaved changes / Saving… / Retry). CloudSync drives the status
// and registers `saveNow`; the Save button reads the status and calls `saveNow`.
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

interface SyncStore {
  status: SaveStatus;
  setStatus: (s: SaveStatus) => void;
  markDirty: () => void;              // a squad/captaincy change the user just made
  saveNow: () => void;               // force an immediate save (set by CloudSync)
  setSaveNow: (fn: () => void) => void;
}

export const useSync = create<SyncStore>((set) => ({
  status: 'saved',
  setStatus: (status) => set({ status }),
  markDirty: () => set((s) => (s.status === 'saving' ? s : { status: 'unsaved' })),
  saveNow: () => {},
  setSaveNow: (fn) => set({ saveNow: fn }),
}));
