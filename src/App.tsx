import { useState } from 'react';
import { useGameStore } from './store/gameStore';
import { ROUNDS } from './data/tournament';
import HomePage from './pages/HomePage';
import DraftPage from './pages/DraftPage';
import TournamentPage from './pages/TournamentPage';
import TeamPage from './pages/TeamPage';
import LeaguePage from './pages/LeaguePage';
import PlayerPage from './pages/PlayerPage';
import Toaster from './components/Toaster';
import HowToPlay from './components/HowToPlay';
import Logo from './components/Logo';
import { NAV_ICONS } from './components/NavIcons';

const NAVY = '#0a1f44';
const BLUE = '#0e6fc4';

const seenRules = () => { try { return !!localStorage.getItem('gsgm-seen-rules'); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem('gsgm-seen-rules', '1'); } catch { /* ignore */ } };

const TABS = [
  { id: 'home',       label: 'Home',    accent: '#37D67A' },
  { id: 'league',     label: 'League',  accent: '#F0C24B' },
  { id: 'draft',      label: 'Market',  accent: '#4aa8ea' },
  { id: 'tournament', label: 'Bracket', accent: '#E5472B' },
] as const;

export default function App() {
  const { activeTab, setActiveTab, phase, myScore, budget, currentRoundIndex, myTeam } = useGameStore();
  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  const [showRules, setShowRules] = useState(() => !seenRules());

  const closeRules = () => { setShowRules(false); markSeen(); };

  return (
    <div className="min-h-screen" style={{ background: '#EEF1F5' }}>
      {/* ── ATP-style navy header ── */}
      <header className="sticky top-0 z-50" style={{ background: NAVY, boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 6px 20px rgba(10,27,51,0.18)' }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-4 h-16">
            {/* Brand logo (reversed lockup for the navy header) — the visual anchor.
                Wrapper divs (not the Logo itself) carry the responsive show/hide, so the
                Logo's own inline flex can't override Tailwind's `hidden`. */}
            <button onClick={() => setActiveTab('home')} className="shrink-0 mr-1" aria-label="Grand Slam GM — home">
              <div className="hidden sm:block"><Logo height={42} reversed /></div>
              <div className="sm:hidden"><Logo height={38} reversed markOnly /></div>
            </button>

            {/* Nav — icon + label per tab, distinct accent underline when active;
                scrolls horizontally on very narrow screens so it never overflows */}
            <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
              {TABS.map(tab => {
                const active = activeTab === tab.id;
                const Icon = NAV_ICONS[tab.id];
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
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
                    {tab.label}
                    {tab.id === 'league' && myTeam.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: BLUE, color: '#fff' }}>
                        {myTeam.length}
                      </span>
                    )}
                    {tab.id === 'tournament' && phase === 'pre_round' && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#37D67A' }} />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Status chips */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {phase !== 'draft' && (
                <div className="font-num px-3 py-1 rounded-full text-sm font-bold" style={{ background: 'rgba(55,214,122,0.16)', color: '#37D67A' }}>
                  {myScore} pts
                </div>
              )}
              <div className="font-num px-3 py-1 rounded-full text-sm font-semibold text-white" style={{ background: 'rgba(255,255,255,0.10)' }}>
                ${budget.toFixed(1)}M
              </div>
              {phase === 'pre_round' && currentRound && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(14,111,196,0.25)', color: '#8EB6F5' }}>
                  <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#8EB6F5', display: 'inline-block' }} />
                  {currentRound.short}
                </div>
              )}
              {phase === 'finished' && (
                <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(217,154,0,0.2)', color: '#F0C24B' }}>
                  Complete
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowRules(true)}
                aria-label="How to play"
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#B9C6DA' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = '#B9C6DA')}
                title="How to play"
              >
                ?
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="fade-in">
        {activeTab === 'home'       && <HomePage />}
        {activeTab === 'draft'      && <DraftPage />}
        {activeTab === 'tournament' && <TournamentPage />}
        {activeTab === 'league'     && <LeaguePage />}
        {activeTab === 'team'       && <TeamPage />}
        {activeTab === 'player'     && <PlayerPage />}
      </main>

      <HowToPlay open={showRules} onClose={closeRules} />
      <Toaster />
    </div>
  );
}
