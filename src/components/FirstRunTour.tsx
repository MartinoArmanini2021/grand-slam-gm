import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useAuth } from '../auth/AuthProvider';
import { markTourSeen } from '../data/cloud';

// ── First-run tour ───────────────────────────────────────────────────────────
// A one-time, skippable spotlight that walks a new manager through the four tabs, so the game
// loop is legible before they touch anything. Highlights each nav tab in turn (a real cutout via
// a huge spread shadow), with a tooltip below the header. Ends on Home so the "Your next move"
// coach picks up from there. "Seen" is a PER-ACCOUNT flag (profiles.tour_seen_at, hydrated into
// the profile store), so it never re-shows on a new device / after a cache clear — with a
// localStorage fallback so a failed cloud write can't re-nag the same browser.

const STEPS = [
  { id: 'home',       title: 'This is your squad HQ',    body: 'Your team, your live score, and a coach telling you exactly what to do next all live here on Home.' },
  { id: 'draft',      title: 'The Market is your desk',  body: 'Draft your 10 players here before the event — then cash in knocked-out players and sign replacements between rounds.' },
  { id: 'tournament', title: 'The Bracket is the action', body: 'The live draw. Your players are highlighted, so you can follow every match that matters to you.' },
  { id: 'league',     title: 'The League is the point',  body: 'Everyone starts with the same $150M. This is where you climb the table and settle it with your friends.' },
];

// Same-device fallback only (the account flag is the real source of truth). A fresh key so the
// brief pre-account localStorage rollout can't suppress the proper per-account tour for anyone.
const TOUR_KEY = 'gsgm-tour-seen-2';
const localSeen = () => { try { return !!localStorage.getItem(TOUR_KEY); } catch { return true; } };

export default function FirstRunTour({ paused }: { paused: boolean }) {
  const setTab = useGameStore(s => s.setActiveTab);
  const { user } = useAuth();
  const hydrated = useProfile(s => s.hydrated); // wait for the cloud profile so we KNOW if it's seen
  const tourSeen = useProfile(s => s.tourSeen);  // per-account flag (profiles.tour_seen_at)
  const [dismissed, setDismissed] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const active = hydrated && !tourSeen && !localSeen() && !paused && !dismissed;

  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${STEPS[i].id}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const t = setTimeout(measure, 80); // let the header settle before locking on
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [i, active]);

  if (!active || !rect) return null;

  const close = () => {
    try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } // same-device fallback
    useProfile.getState().set({ tourSeen: true });   // don't re-show this session
    if (user) void markTourSeen(user.id);             // persist per-account, cross-device
    setDismissed(true);
  };
  // Finish on the MARKET, not Home. The tour is reached by tapping "Build my squad →", and it used
  // to end with setTab('home') — teleporting the manager off the very screen they had just asked for
  // and leaving them on Home with an empty squad. Drafting is the one thing that must happen before
  // the deadline, so the tour hands them straight to it.
  const next = () => { if (i < STEPS.length - 1) setI(i + 1); else { setTab('draft'); close(); } };
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <>
      {/* click-blocker so the app can't be operated mid-tour (the tour drives navigation) */}
      <div className="fixed inset-0 z-[60]" />
      {/* spotlight: the ring is bright, its huge spread shadow dims everything else */}
      <div className="fixed z-[61] pointer-events-none" style={{
        top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8,
        borderRadius: 14, outline: '2px solid #ff6a4d', boxShadow: '0 0 0 9999px rgba(6,14,28,0.66)',
      }} />
      {/* tooltip below the header */}
      <div className="fixed z-[62]" style={{ top: rect.bottom + 14, left: '50%', transform: 'translateX(-50%)', width: 'min(340px, calc(100vw - 26px))' }}>
        <div className="rounded-2xl p-4 fade-in" style={{ background: '#FFFFFF', boxShadow: '0 18px 44px rgba(6,14,28,0.5)' }}>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--ember)' }}>Welcome · {i + 1} of {STEPS.length}</div>
          <h4 className="text-base font-extrabold mt-1.5 mb-1" style={{ color: 'var(--ink)' }}>{step.title}</h4>
          <p className="text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>{step.body}</p>
          <div className="flex items-center gap-2 mt-3.5">
            <div className="flex gap-1.5 mr-auto">
              {STEPS.map((_, k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: k === i ? 'var(--ember)' : 'rgba(10,27,51,0.16)' }} />)}
            </div>
            <button onClick={close} className="text-xs font-semibold px-1" style={{ color: 'var(--ink-3)' }}>Skip</button>
            <button onClick={next} className="text-xs font-bold text-white px-3.5 py-2 rounded-lg" style={{ background: 'var(--ember)' }}>
              {last ? 'Got it →' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
