import { TOURNAMENT, SELECTABLE_TOURNAMENTS, switchTournament } from '../data/tournamentConfig';

// Switch between tournaments — each keeps its OWN squad, budget and leaderboard, isolated by
// tournament id, so this is a real context switch rather than a filter.
//
// SHOWS AS SOON AS THERE IS SOMEWHERE TO GO (>1 selectable), where it used to need >1 *live*.
// That looked equivalent and was not: once finished events became browsable, a manager whose saved
// choice was a finished tournament would land there and find the one control that could get them
// back to the running event hidden — hidden precisely BECAUSE only one event was live. The switcher
// has to be visible in exactly the situation it is needed most.
//
// Lives at the FOOT of the Home page, not in the header: as a header control it ate a large slice
// of a phone's title bar for something you touch once an event. Down here it reads as what it is —
// a way to go back and look at a finished tournament — and gets room for a proper label.
export default function TournamentSwitcher() {
  if (SELECTABLE_TOURNAMENTS.length <= 1) return null;
  return (
    <div className="mt-8 mb-2">
      <div
        className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2 text-center"
        style={{ color: 'var(--ink-3)' }}
      >
        Tournament
      </div>
      <div
        role="group"
        aria-label="Switch tournament"
        className="flex gap-1 p-1 rounded-xl mx-auto w-fit max-w-full overflow-x-auto"
        style={{ background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.10)' }}
      >
        {SELECTABLE_TOURNAMENTS.map(t => {
          const active = t.id === TOURNAMENT.id;
          const done = t.status === 'completed';
          return (
            <button
              key={t.id}
              onClick={() => switchTournament(t.id)}
              aria-pressed={active}
              // Finished events are legitimate destinations, so they are never disabled — but the
              // label has to say so BEFORE the tap, or the read-only screen that follows reads as
              // the app being broken rather than as a tournament being over.
              aria-label={done ? `${t.name} — finished` : t.name}
              className="px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors min-h-[38px] flex items-center gap-1.5"
              style={{
                background: active ? '#FFFFFF' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--ink-3)',
                border: active ? '1px solid rgba(10,27,51,0.12)' : '1px solid transparent',
                boxShadow: active ? '0 1px 2px rgba(10,27,51,0.08)' : 'none',
                cursor: active ? 'default' : 'pointer',
              }}
            >
              {t.name}
              {done && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(10,27,51,0.07)', color: 'var(--ink-3)' }}
                >
                  Finished
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="text-[11px] mt-2 text-center" style={{ color: 'var(--ink-3)' }}>
        Each tournament keeps its own squad and standings.
      </div>
    </div>
  );
}
