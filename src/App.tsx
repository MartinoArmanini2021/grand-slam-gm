import { useState } from 'react';
import { useGameStore } from './store/gameStore';
import { ROUNDS } from './data/tournament';
import HomePage from './pages/HomePage';
import DraftPage from './pages/DraftPage';
import TournamentPage from './pages/TournamentPage';
import PlayersPage from './pages/PlayersPage';
import TeamPage from './pages/TeamPage';
import LeaguePage from './pages/LeaguePage';
import BacktestPage from './pages/BacktestPage';
import PlayerPage from './pages/PlayerPage';
import Toaster from './components/Toaster';
import HowToPlay from './components/HowToPlay';
import Logo from './components/Logo';
import { toast } from './store/toastStore';

const NAVY = '#0a1f44';
const BLUE = '#0e6fc4';

const seenRules = () => { try { return !!localStorage.getItem('gsgm-seen-rules'); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem('gsgm-seen-rules', '1'); } catch { /* ignore */ } };

const TABS = [
  { id: 'home',       label: 'Home'    },
  { id: 'league',     label: 'League'  },
  { id: 'tournament', label: 'Bracket' },
  { id: 'draft',      label: 'Draft'   },
  { id: 'players',    label: 'Stats'   },
] as const;

export default function App() {
  const { activeTab, setActiveTab, phase, myScore, budget, currentRoundIndex, myTeam } = useGameStore();
  const currentRound = currentRoundIndex < ROUNDS.length ? ROUNDS[currentRoundIndex] : null;
  const [showRules, setShowRules] = useState(() => !seenRules());
  const [confirmReset, setConfirmReset] = useState(false);

  const closeRules = () => { setShowRules(false); markSeen(); };
  const doReset = () => { useGameStore.getState().resetGame(); setConfirmReset(false); toast('Game reset — draft a new squad', 'info'); };

  return (
    <div className="min-h-screen" style={{ background: '#EEF1F5' }}>
      {/* ── ATP-style navy header ── */}
      <header className="sticky top-0 z-50" style={{ background: NAVY, boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 6px 20px rgba(10,27,51,0.18)' }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-4 h-16">
            {/* Brand logo (reversed lockup for the navy header) — the visual anchor */}
            <button onClick={() => setActiveTab('home')} className="shrink-0 mr-1" aria-label="Grand Slam GM — home">
              <Logo height={36} reversed className="hidden sm:flex" />
              <Logo height={34} reversed markOnly className="sm:hidden" />
            </button>

            {/* Nav */}
            <nav className="flex items-center gap-0.5 flex-1">
              {TABS.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="relative px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      color: active ? '#fff' : '#8FA1BE',
                      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                    }}
                  >
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
              <button
                onClick={() => setConfirmReset(true)}
                className="text-xs transition-colors"
                style={{ color: '#6B7E9C' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#B9C6DA')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B7E9C')}
              >
                Reset
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
        {activeTab === 'players'    && <PlayersPage />}
        {activeTab === 'team'       && <TeamPage />}
        {activeTab === 'backtest'   && <BacktestPage />}
        {activeTab === 'player'     && <PlayerPage />}
      </main>

      <HowToPlay open={showRules} onClose={closeRules} />
      <Toaster />

      {/* Reset confirmation */}
      {confirmReset && (
        <div
          onClick={() => setConfirmReset(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} className="fade-in card" style={{ maxWidth: 380, width: '100%', padding: 22, background: '#fff' }}>
            <div className="text-lg font-bold" style={{ color: '#0a1f44' }}>Reset your game?</div>
            <p className="text-sm mt-1 mb-4" style={{ color: '#5B6B84' }}>
              This clears your squad, captain, score and transfers, and starts a fresh draft. This can’t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#F0F3F7', color: '#0a1f44', border: '1px solid rgba(10,27,51,0.1)' }}
              >
                Cancel
              </button>
              <button
                onClick={doReset}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: '#E5472B' }}
              >
                Reset game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
