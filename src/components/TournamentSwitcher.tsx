import { TOURNAMENT, LIVE_TOURNAMENTS, switchTournament } from '../data/tournamentConfig';

// Header control to switch between the LIVE tournaments (each keeps its own squad +
// leaderboard, isolated by tournament id). Renders nothing when only one is live, so it
// never appears until a second tournament launches.
export default function TournamentSwitcher() {
  if (LIVE_TOURNAMENTS.length <= 1) return null;
  return (
    <div className="relative shrink-0">
      <select
        value={TOURNAMENT.id}
        onChange={e => switchTournament(e.target.value)}
        aria-label="Switch tournament"
        className="appearance-none text-xs font-bold rounded-lg pl-2.5 pr-6 py-2 min-h-[36px] cursor-pointer max-w-[46vw] sm:max-w-none truncate"
        style={{ background: 'rgba(255,255,255,0.13)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}
        title="Switch tournament"
      >
        {LIVE_TOURNAMENTS.map(t => (
          <option key={t.id} value={t.id} style={{ color: '#0a1f44' }}>{t.name}</option>
        ))}
      </select>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none" style={{ color: '#fff' }}>▾</span>
    </div>
  );
}
