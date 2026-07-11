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

const NAVY = '#0A1B33';
const BLUE = '#1466D6';

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

  return (
    <div className="min-h-screen" style={{ background: '#EEF1F5' }}>
      {/* ── ATP-style navy header ── */}
      <header className="sticky top-0 z-50" style={{ background: NAVY, boxShadow: '0 1px 0 rgba(255,255,255,0.06), 0 6px 20px rgba(10,27,51,0.18)' }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-4 h-14">
            {/* Logo — placeholder monogram; swap for the Grand Slam GM logo when ready */}
            <button onClick={() => setActiveTab('home')} className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold text-sm" style={{ background: BLUE }}>
                GM
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-extrabold leading-tight tracking-tight text-white">Grand Slam GM</div>
                <div className="text-[10px]" style={{ color: '#8FA1BE' }}>Wimbledon 2026</div>
              </div>
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
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(20,102,214,0.25)', color: '#8EB6F5' }}>
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

            <button
              onClick={() => useGameStore.getState().resetGame()}
              className="text-xs transition-colors shrink-0"
              style={{ color: '#6B7E9C' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#B9C6DA')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6B7E9C')}
            >
              Reset
            </button>
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
    </div>
  );
}
