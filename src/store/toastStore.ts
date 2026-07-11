import { create } from 'zustand';

export type ToastKind = 'info' | 'good' | 'warn';
export interface Toast { id: number; msg: string; kind: ToastKind; }

interface ToastStore {
  toasts: Toast[];
  push: (msg: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (msg, kind = 'info') => {
    const id = ++nextId;
    set(s => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 2800);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// Convenience for firing a toast from anywhere in the UI.
export const toast = (msg: string, kind?: ToastKind) => useToasts.getState().push(msg, kind);
