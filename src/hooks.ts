import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

// Poll `fn` roughly every `intervalMs`, but ONLY while the browser tab is visible. A
// backgrounded tab stops hitting the network entirely — which saves the user's battery
// and, at scale (thousands of open tabs), keeps idle clients from hammering the backend.
// Refocusing the tab fires an immediate refresh so the data is never stale on return. A
// ±15% random jitter desynchronises many clients so their polls don't arrive in one spike.
// `active=false` disables polling (e.g. signed-out). `fn` is read through a ref, so passing
// a fresh closure each render never re-subscribes the timer.
export function useVisiblePoll(fn: () => void, intervalMs: number, active = true) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const nextDelay = () => intervalMs * (0.85 + Math.random() * 0.3);
    const schedule = () => {
      timer = setTimeout(() => {
        if (stopped) return;
        if (!document.hidden) cb.current(); // skip the tick entirely while hidden
        schedule();
      }, nextDelay());
    };
    schedule();
    const onVisible = () => { if (!document.hidden && !stopped) cb.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [intervalMs, active]);
}

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
