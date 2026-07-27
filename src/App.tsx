import { useState } from 'react';
import { useGameStore } from './store/gameStore';
import { ROUNDS } from './data/tournament';
import HomePage from './pages/HomePage';
import DraftPage from './pages/DraftPage';
import TournamentPage from './pages/TournamentPage';
import TeamPage from './pages/TeamPage';
import LeaguePage from './pages/LeaguePage';
import PlayerPage from './pages/PlayerPage';
import AdminPage from './pages/AdminPage';
import { isAdmin } from './data/admin';
import Toaster from './components/Toaster';
import HowToPlay from './components/HowToPlay';
import Logo from './components/Logo';
import { NAV_ICONS } from './components/NavIcons';
import AuthScreen from './components/AuthScreen';
import UserProfile from './components/UserProfile';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './auth/AuthProvider';

const NAVY = 'var(--ink)';
const BLUE = 'var(--blue)';

const seenRules = () => { try { return !!localStorage.getItem('gsgm-seen-rules'); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem('gsgm-seen-rules', '1'); } catch { /* ignore */ } };

const TABS = [
  { id: 'home',       label: 'Home',    accent: 'var(--green-bright)' },
  { id: 'league',     label: 'League',  accent: 'var(--gold-bright)' },
  { id: 'draft',      label: 'Market',  accent: 'var(--blue-light)' },
  { id: 'tournament', label: 'Bracket', accent: 'var(--ember)' },
] as const;

// The operator's match-admin tab is appended only for admins (a local flag toggled
// from the profile menu). Regular players never see it.
const ADMIN_TAB = { id: 'admin', label: 'Admin', accent: 'var(--blue-light)' } as const;

export default function App() {
  const { activeTab, setActiveTab, phase, myScore, currentRoundIndex, myTeam } = useGameStore();
  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  const [showRules, setShowRules] = useState(() => !seenRules());
  const [showProfile, setShowProfile] = useState(false);
  const { ready, user, guest } = useAuth();
  const tabs = isAdmin() ? [...TABS, ADMIN_TAB] : TABS;

  const closeRules = () => { setShowRules(false); markSeen(); };

  // Auth gate — while checking the session, then the login screen until the
  // visitor signs in or chooses to continue as a guest.
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="text-sm" style={{ color: 'var(--on-navy-2)' }}>Loading…</div>
      </div>
    );
  }
  if (!user && !guest) return <AuthScreen />;

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
                    onClick={() => setActiveTab(tab.id)}
                    aria-label={tab.label}
                    aria-current={active ? 'page' : undefined}
                    className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 whitespace-nowrap"
                    style={{
                      color: active ? '#fff' : '#9FB0CC',
                      background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
                      boxShadow: active ? `inset 0 -2.5px 0 ${tab.accent}` : 'none',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#9FB0CC'; }}
                  >
                    <Icon size={17} style={{ color: active ? tab.accent : 'currentColor' }} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.id === 'league' && myTeam.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: BLUE, color: '#fff' }}>
                        {myTeam.length}
                      </span>
                    )}
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
                  {myScore} pts
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
              <button
                onClick={() => setShowRules(true)}
                aria-label="How to play"
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
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
                className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
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
          {activeTab === 'home'       && <HomePage />}
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
    </div>
  );
}
