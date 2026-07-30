import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

// Make a non-<button> interactive element (a clickable row or chip) keyboard-
// operable: Enter or Space activates it, matching native button behaviour. Pair
// with role="button" tabIndex={0}.
export const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

// A stack of the currently-active Escape-closable overlays, most-recent last, so a
// single Escape dismisses only the TOPMOST modal (not every stacked one at once —
// e.g. the purchase-confirm over the market picker).
let escStack: symbol[] = [];
// Ref-counted body-scroll lock: while ANY modal is open the page behind it must not
// scroll (a real mobile bug — dragging otherwise slides the background under the sheet).
let scrollLockCount = 0;
let prevBodyOverflow = '';

// Dismiss an overlay/modal with the Escape key while it's open, and lock background
// scroll for its lifetime. Only the modal that opened most recently responds to Escape,
// so nested modals close one layer at a time.
export function useEscapeToClose(onClose: () => void, active = true) {
  const cb = useRef(onClose);
  cb.current = onClose; // always call the latest handler without re-subscribing
  useEffect(() => {
    if (!active) return;
    const id = Symbol('esc');
    escStack.push(id); // push once per active period (deps: [active]), preserving open order
    if (scrollLockCount++ === 0) { prevBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && escStack[escStack.length - 1] === id) cb.current();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      escStack = escStack.filter(x => x !== id);
      if (--scrollLockCount === 0) document.body.style.overflow = prevBodyOverflow;
    };
  }, [active]);
}
