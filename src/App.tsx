import { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { track } from './data/analytics';
import { ROUNDS, liveRoundStatus } from './data/tournament';
import { useMyScore } from './data/useMyScore';
import { fmtScore } from './data/format';
import HomePage from './pages/HomePage';
import DraftPage from './pages/DraftPage';
import TournamentPage from './pages/TournamentPage';
import TeamPage from './pages/TeamPage';
import LeaguePage from './pages/LeaguePage';
import PlayerPage from './pages/PlayerPage';
import AdminPage from './pages/AdminPage';
import Toaster from './components/Toaster';
import VersionGate from './components/VersionGate';
import FirstRunTour from './components/FirstRunTour';
import HowToPlay from './components/HowToPlay';
import Logo from './components/Logo';
import { NAV_ICONS } from './components/NavIcons';
import AuthScreen from './components/AuthScreen';
import JoinTournament from './components/JoinTournament';
import TournamentSwitcher from './components/TournamentSwitcher';
import UserProfile from './components/UserProfile';
import ErrorBoundary from './components/ErrorBoundary';
import CloudSync from './components/CloudSync';
import ScoreSync from './components/ScoreSync';
import LiveFeed from './components/LiveFeed';
import { useAuth } from './auth/AuthProvider';
import { useProfile, markTournamentJoined } from './store/profileStore';
import { TOURNAMENT } from './data/tournamentConfig';
import { joinLeague } from './data/cloud';
import { toast } from './store/toastStore';

const NAVY = 'var(--ink)';

const seenRules = () => { try { return !!localStorage.getItem('gsgm-seen-rules'); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem('gsgm-seen-rules', '1'); } catch { /* ignore */ } };

const TABS = [
  { id: 'home',       label: 'Home',    accent: 'var(--green-bright)' },
  { id: 'league',     label: 'League',  accent: 'var(--gold-bright)' },
  { id: 'draft',      label: 'Market',  accent: 'var(--blue-light)' },
  { id: 'tournament', label: 'Bracket', accent: 'var(--ember)' },
] as const;

export default function App() {
  const { activeTab, setActiveTab, phase } = useGameStore();
  // The header badge shows the SERVER-authoritative total (the same number the leaderboard shows),
  // with the instant client projection as a fallback — see useMyScore. useMyScore subscribes to the
  // live draw/results, so `currentRound` below still re-derives the moment a result lands.
  const { score: liveTotal } = useMyScore();
  const leaderStatus = liveRoundStatus();
  const currentRound = leaderStatus ? ROUNDS.find(r => r.id === leaderStatus.round) ?? null : null;
  const [showRules, setShowRules] = useState(() => !seenRules());
  const [showProfile, setShowProfile] = useState(false);
  const [welcome, setWelcome] = useState(false); // show the celebratory Home overlay right after joining
  const { ready, user } = useAuth();
  const tabs = TABS; // Match Admin is disabled until player roles & permissions are defined

  // Onboarding gate: has this player joined the ACTIVE tournament yet? A fresh
  // tournament id is absent from joinedTournaments, so they onboard (and get a
  // clean squad) once per event. For signed-in players we wait on the cloud verdict
  // (entryHydrated) so a returning player with a saved entry never sees the gate.
  const joinedFlag = useProfile(s => s.joinedTournaments.includes(TOURNAMENT.id));
  const entryHydrated = useProfile(s => s.entryHydrated);
  const entryLoadFailed = useProfile(s => s.entryLoadFailed);
  // Migration / safety: anyone who ALREADY has a squad or has moved past the draft for
  // this tournament has effectively joined — never show them the gate (its reset would
  // wipe their in-progress squad). Covers players who drafted before this gate existed.
  const hasProgress = useGameStore(s => s.myTeam.length > 0 || s.phase !== 'draft' || s.currentRoundIndex > 0);
  const joined = joinedFlag || hasProgress;
  // Persist that inferred join so it survives even if they later reset their squad.
  useEffect(() => { if (hasProgress && !joinedFlag) markTournamentJoined(TOURNAMENT.id); }, [hasProgress, joinedFlag]);
  // The welcome overlay is a one-shot: if the player navigates off Home it's spent, so
  // it never re-appears on a later Home visit within the session.
  useEffect(() => { if (activeTab !== 'home') setWelcome(false); }, [activeTab]);

  // Deep-link invite: capture ?join=CODE once, strip it from the URL, and stash it.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const code = u.searchParams.get('join');
      if (code) {
        sessionStorage.setItem('gsgm-pending-join', code.toUpperCase());
        u.searchParams.delete('join');
        window.history.replaceState({}, '', u.toString());
      }
    } catch { /* ignore */ }
  }, []);
  // Apply a pending invite once the player is signed in AND inside the app (so the
  // toast + tab switch land where they can see them). Guests keep it pending until they
  // create an account, at which point it applies automatically.
  useEffect(() => {
    if (!user || !joined) return;
    let code: string | null = null;
    try { code = sessionStorage.getItem('gsgm-pending-join'); } catch { /* ignore */ }
    if (!code) return;
    const clearPending = () => { try { sessionStorage.removeItem('gsgm-pending-join'); } catch { /* ignore */ } };
    (async () => {
      try {
        const { name } = await joinLeague(code!);
        clearPending(); // only drop the code AFTER a successful join
        toast(`Joined ${name}! 🎾 You're on their leaderboard.`, 'good');
        track('league_joined', { via: 'link' });
        setActiveTab('league');
      } catch (e) {
        const msg = (e instanceof Error ? e.message : '').toLowerCase();
        if (msg.includes('no league') || msg.includes('not found')) {
          clearPending(); // genuinely bad/expired code — stop trying
          toast('That invite link is invalid or expired.', 'warn');
        } else {
          // transient (network) — keep it pending so it retries on the next load
          toast("Couldn't join the league right now — we'll retry when you're back online.", 'info');
        }
      }
    })();
  }, [user, joined, setActiveTab]);

  // Each screen the user opens is a "page view" for analytics (SPA — no URL changes).
  useEffect(() => { if (user) track('tab_view', { tab: activeTab }); }, [activeTab, user]);

  // (No post-join name prompt — the Join gate already collects the team name + handle,
  // so a new player lands straight in the game. Profile edits live behind the header icon.)

  const closeRules = () => { setShowRules(false); markSeen(); };

  // Auth gate — while checking the session, then the login screen until the
  // visitor signs in or creates an account (an account is required to play).
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="text-sm" style={{ color: 'var(--on-navy-2)' }}>Loading…</div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;

  // Signed-in: hold briefly until CloudSync reports whether a cloud entry exists, so a
  // returning player is never flashed the join gate (which would offer a fresh start).
  const awaitingCloud = !joined && !entryHydrated && !entryLoadFailed;
  // Never show the gate if we couldn't confirm the cloud state — its reset could wipe a
  // squad we failed to load; a reload re-checks.
  const showJoinGate = !joined && !awaitingCloud && !entryLoadFailed;

  return (
    <>
      {/* CloudSync is mounted for every signed-in session — including during the gate —
          so entryHydrated resolves and the gate can make its decision. */}
      <CloudSync />
      {/* ScoreSync keeps the authoritative leaderboard score fresh app-wide (scoreStore), so the
          header badge, Home and the Team page can never disagree with the leaderboard row. */}
      <ScoreSync />
      {/* LiveFeed pulls the draw + results for EVERY signed-in user (not just the admin),
          so the bracket and live scoring populate for everyone once play begins. */}
      <LiveFeed />
      {awaitingCloud ? (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
          <div className="flex flex-col items-center gap-3 fade-in">
            <Logo height={40} reversed />
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--on-navy-2)' }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--green-bright)', display: 'inline-block' }} />
              Loading…
            </span>
          </div>
        </div>
      ) : showJoinGate ? (
        // The Join + Welcome flow IS the onboarding, so don't also pop the first-run
        // rules modal on top of it (the "?" button still opens it anytime).
        <JoinTournament onJoined={() => { setActiveTab('home'); setWelcome(true); setShowRules(false); markSeen(); }} />
      ) : (
        <AppShell
          tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab}
          phase={phase} myScore={liveTotal} currentRound={currentRound}
          showRules={showRules} setShowRules={setShowRules}
          showProfile={showProfile} setShowProfile={setShowProfile}
          closeRules={closeRules}
          welcome={welcome} onWelcomeClose={() => setWelcome(false)}
        />
      )}
    </>
  );
}

function AppShell({
  tabs, activeTab, setActiveTab, phase, myScore, currentRound,
  showRules, setShowRules, showProfile, setShowProfile, closeRules, welcome, onWelcomeClose,
}: {
  tabs: typeof TABS;
  activeTab: ReturnType<typeof useGameStore.getState>['activeTab'];
  setActiveTab: (t: ReturnType<typeof useGameStore.getState>['activeTab']) => void;
  phase: string; myScore: number; currentRound: { short: string } | null;
  showRules: boolean; setShowRules: (v: boolean) => void;
  showProfile: boolean; setShowProfile: (v: boolean) => void;
  closeRules: () => void; welcome: boolean; onWelcomeClose: () => void;
}) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ── ATP-style navy header ── */}
      <header className="sticky top-0 z-50" style={{ background: NAVY, boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 6px 20px rgba(10,27,51,0.18)' }}>
        <div className="w-full px-3 sm:px-5">
          <div className="flex items-center gap-4 h-16">
            {/* Brand logo (reversed lockup for the navy header) — the visual anchor.
                Wrapper divs (not the Logo itself) carry the responsive show/hide, so the
                Logo's own inline flex can't override Tailwind's `hidden`. */}
            <button onClick={() => setActiveTab('home')} className="shrink-0 mr-3 sm:mr-8" aria-label="Grand Slam GM — home">
              <div className="hidden sm:block"><Logo height={42} reversed /></div>
              <div className="sm:hidden"><Logo height={38} reversed markOnly /></div>
            </button>

            {/* Nav — icon + label per tab, distinct accent underline when active;
                scrolls horizontally on very narrow screens so it never overflows */}
            <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
              {tabs.map(tab => {
                const active = activeTab === tab.id;
                const Icon = NAV_ICONS[tab.id];
                return (
                  <button
                    key={tab.id}
                    data-tour={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    aria-label={tab.label}
                    aria-current={active ? 'page' : undefined}
                    className="relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap"
                    style={{
                      color: active ? '#fff' : '#9FB0CC',
                      background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
                      boxShadow: active ? `inset 0 -2.5px 0 ${tab.accent}` : 'none',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#9FB0CC'; }}
                  >
                    <Icon size={17} style={{ color: active ? tab.accent : 'currentColor' }} />
                    <span className="text-[10px] leading-none sm:text-sm">{tab.label}</span>
                    {tab.id === 'tournament' && phase === 'pre_round' && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--green-bright)' }} />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Status chips */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {phase !== 'draft' && (
                <div className="font-num px-3 py-1 rounded-full text-sm font-bold" style={{ background: 'rgba(55,214,122,0.16)', color: 'var(--green-bright)' }}>
                  {fmtScore(myScore)} pts
                </div>
              )}
              {phase === 'pre_round' && currentRound && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(14,111,196,0.25)', color: '#8EB6F5' }}>
                  <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#8EB6F5', display: 'inline-block' }} />
                  {currentRound.short}
                </div>
              )}
              {phase === 'finished' && (
                <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(217,154,0,0.2)', color: 'var(--gold-bright)' }}>
                  Complete
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <TournamentSwitcher />
              <button
                onClick={() => { track('howtoplay_opened'); setShowRules(true); }}
                aria-label="How to play"
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#B9C6DA' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = '#B9C6DA')}
                title="How to play"
              >
                ?
              </button>
              <button
                onClick={() => setShowProfile(true)}
                aria-label="Your profile"
                title="Your profile"
                className="w-11 h-11 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#B9C6DA' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = '#B9C6DA')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="fade-in">
        <ErrorBoundary>
          {activeTab === 'home'       && <HomePage welcome={welcome} onWelcomeClose={onWelcomeClose} />}
          {activeTab === 'draft'      && <DraftPage />}
          {activeTab === 'tournament' && <TournamentPage />}
          {activeTab === 'league'     && <LeaguePage />}
          {activeTab === 'team'       && <TeamPage />}
          {activeTab === 'player'     && <PlayerPage />}
          {activeTab === 'admin'      && <AdminPage />}
        </ErrorBoundary>
      </main>

      <HowToPlay open={showRules} onClose={closeRules} />
      <UserProfile open={showProfile} onClose={() => setShowProfile(false)} />
      <Toaster />
      <VersionGate />
      {/* One-time spotlight tour of the tabs — waits until the rules/welcome overlays are gone. */}
      <FirstRunTour paused={showRules || welcome} />
    </div>
  );
}
