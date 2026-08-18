import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { planSquad, wayOut } from '../data/squadPlan';
import { findPlayer } from '../data/players';
import { lastName } from '../data/format';
import { SQUAD_SIZE } from '../data/squadRules';

// ── "Where am I, and can I still finish?" ────────────────────────────────────────────────────────
//
// Built from production evidence, not intuition. Four of eight Cincinnati managers scored zero.
// One was mathematically stuck — 7 players, $7M left, needing a combination that cost at least
// $26M — and the app's only signal was every Platinum greyed out as "over your remaining budget".
// That reads as "not right now", not "never, and you must sell someone". Another was $4M from the
// same trap and could not have known.
//
// The rules were enforced but never projected. This projects them: what you still need, the least
// it can cost, whether you can afford it, and — when you cannot — the specific way out.
//
// Deliberately silent when everything is fine and there is nothing useful to add. A panel that
// speaks only when it has something to say is trusted; one that always speaks is wallpaper.
export default function SquadProgress({ onSell }: { onSell?: (id: string) => void }) {
  const { myTeam, phase } = useGameStore();
  const budget = useGameStore(s => s.budget);

  const plan = useMemo(() => planSquad(myTeam, budget), [myTeam, budget]);
  const escape = useMemo(() => (plan.stuck ? wayOut(myTeam, budget) : null), [plan.stuck, myTeam, budget]);

  if (phase !== 'draft') return null;
  if (myTeam.length === 0) return null;      // the empty state is the Market's job, not a status panel
  if (plan.complete) return null;            // done — the save control speaks instead

  const needText = plan.needed.map(n => `${n.missing} ${n.tier}`).join(' and ');

  // ── STUCK: the dead end, named, with the way out ──────────────────────────────────────────────
  if (plan.stuck) {
    const names = (escape?.sell ?? []).map(id => lastName(findPlayer(id)?.name ?? id));
    return (
      <div className="rounded-xl p-3.5 mb-3" style={{ background: 'rgba(229,71,43,0.07)', border: '1px solid rgba(229,71,43,0.30)' }}>
        <div className="text-sm font-extrabold" style={{ color: 'var(--ember)' }}>
          You can't finish this squad
        </div>
        <div className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          You still need <strong>{needText}</strong>, and the cheapest players left cost{' '}
          <strong>${plan.cheapestFinish}M</strong> — but you have <strong>${plan.budget.toFixed(1)}M</strong>.
          You're <strong>${escape?.shortfall ?? Math.abs(plan.headroom)}M</strong> short.
        </div>
        {names.length > 0 ? (
          <div className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Selling <strong>{names.join(' and ')}</strong> would fix it.
            {onSell && escape!.sell.length === 1 && (
              <button
                onClick={() => onSell(escape!.sell[0])}
                className="ml-2 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={{ background: 'var(--ember)', color: '#fff' }}
              >
                Sell {names[0]}
              </button>
            )}
          </div>
        ) : (
          <div className="text-xs mt-2" style={{ color: 'var(--ink-2)' }}>
            Free up at least <strong>${escape?.shortfall}M</strong> by removing players you've picked.
          </div>
        )}
      </div>
    );
  }

  // ── ON TRACK: what's left, and the floor under it ─────────────────────────────────────────────
  return (
    <div
      className="rounded-xl p-3.5 mb-3"
      style={
        plan.tight
          ? { background: 'rgba(217,154,0,0.08)', border: '1px solid rgba(217,154,0,0.32)' }
          : { background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.10)' }
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          {plan.slotsLeft} more to pick
        </div>
        <div className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>
          {myTeam.length}/{SQUAD_SIZE}
        </div>
      </div>
      <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        You need <strong>{needText}</strong>. The cheapest way to finish costs{' '}
        <strong>${plan.cheapestFinish}M</strong> of your <strong>${plan.budget.toFixed(1)}M</strong>.
      </div>
      {plan.tight && (
        // The 51face7f warning: still possible, but one ordinary-looking pick from impossible.
        <div className="text-xs mt-2 font-semibold" style={{ color: 'var(--gold-deep, #8a6200)' }}>
          Careful — that leaves only ${plan.headroom.toFixed(1)}M spare. Pick anyone pricier than the
          cheapest option and you may not be able to complete your squad.
        </div>
      )}
    </div>
  );
}
