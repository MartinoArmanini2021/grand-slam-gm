import { useEffect } from 'react';
import type { KeyboardEvent } from 'react';

// Make a non-<button> interactive element (a clickable row or chip) keyboard-
// operable: Enter or Space activates it, matching native button behaviour. Pair
// with role="button" tabIndex={0}.
export const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

// Dismiss an overlay/modal with the Escape key while it's open.
export function useEscapeToClose(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, active]);
}
