import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { ROUNDS, getPlayerExit, BUDGET_RETURN_RATES, MATCHES, getOpponentId, upsetBonus } from '../data/tournament';
import { getRivalTeams } from '../data/rivals';
import SurfaceBar from '../components/SurfaceBar';
import PlayerAvatar from '../components/PlayerAvatar';
import { getTier, TIER_META } from '../data/tiers';
import type { RoundId } from '../types';

function BackToLeague() {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  return (
    <button
      onClick={() => setActiveTab('league')}
      className="inline-flex items-center gap-1 text-sm font-semibold mb-4"
      style={{ color: '#0e6fc4' }}
    >
      ‹ League
    </button>
  );
}

export default function TeamPage() {
  const {
    myTeam, captain, setCaptain, budget, myScore, roundScores,
    budgetReturns, phase, currentRoundIndex, captainHistory, viewTeam, openPlayer,
  } = useGameStore();

  if (viewTeam !== 'you') {
    return <RivalTeamView id={viewTeam} currentRoundIndex={currentRoundIndex} />;
  }

  if (myTeam.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center fade-in">
        <div className="text-5xl mb-4">🎾</div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#0a1f44' }}>No squad yet</h2>
        <p className="text-sm" style={{ color: '#5B6B84' }}>Head to the Market tab to pick your 6 players.</p>
      </div>
    );
  }

  const revealedRoundIds = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 fade-in">
      <BackToLeague />

      {/* ── Score summary ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Score', value: myScore, unit: 'pts', color: '#0e6fc4' },
          { label: 'Budget Left', value: `$${budget.toFixed(1)}M`, unit: 'of $100M', color: '#0a1f44' },
          {
            label: phase === 'finished' ? 'Final Round' : 'Current Round',
            value: phase === 'finished' ? 'F' : phase === 'draft' ? '—' : ROUNDS[currentRoundIndex]?.short ?? '—',
            unit: phase === 'finished' ? 'done' : 'in play',
            color: '#0a1f44',
          },
        ].map((c, i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
            <div className="text-xs mb-1" style={{ color: '#5B6B84' }}>{c.label}</div>
            <div className="font-num text-3xl font-bold" style={{ color: c.color }}>{c.value}</div>
            <div className="text-xs mt-0.5" style={{ color: '#9AA7BC' }}>{c.unit}</div>
          </div>
        ))}
      </div>

      {/* ── Round breakdown ── */}
      {roundScores.length > 0 && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(10,27,51,0.07)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5B6B84' }}>Round Breakdown</h3>
          </div>
          <div className="flex divide-x" style={{ borderColor: 'rgba(10,27,51,0.07)' }}>
            {ROUNDS.map((round, idx) => {
              const rs = roundScores.find(s => s.round === round.id);
              const done = idx < currentRoundIndex;
              return (
                <div key={round.id} className="flex-1 p-3 text-center" style={{ opacity: done ? 1 : 0.25 }}>
                  <div className="text-xs mb-1" style={{ color: '#5B6B84' }}>{round.short}</div>
                  <div className="font-num text-lg font-bold" style={{ color: rs && rs.points > 0 ? '#12A150' : '#9AA7BC' }}>
                    {rs ? `+${rs.points}` : '—'}
                  </div>
                  {rs && rs.captainBonus > 0 && (
                    <div className="text-[10px] mt-0.5" style={{ color: '#D99A00' }}>⭐ +{rs.captainBonus}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Captain hint ── */}
      {phase === 'pre_round' && (
        <p className="text-xs mb-4" style={{ color: '#D99A00' }}>⭐ Tap a player to set as captain (2× points)</p>
      )}

      {/* ── Players ── */}
      <div className="space-y-2">
        {myTeam.map(id => {
          const p = getPlayer(id);
          const exit = getPlayerExit(id);
          const isEliminated = exit !== null && revealedRoundIds.includes(exit);
          const isCap = captain === id;
          const historyCap = captainHistory.filter(h => h.playerId === id).map(h => h.round);
          const budgetReturn = budgetReturns.find(r => r.playerId === id);
          const isWinner = exit === null && phase === 'finished';

          return (
            <div
              key={id}
              onClick={() => !isEliminated && phase === 'pre_round' && setCaptain(id)}
              className="rounded-2xl p-4 transition-all"
              style={{
                background: isCap ? 'rgba(217,154,0,0.05)' : '#FFFFFF',
                border: `1px solid ${isCap ? 'rgba(217,154,0,0.2)' : 'rgba(10,27,51,0.07)'}`,
                opacity: isEliminated ? 0.5 : 1,
                cursor: !isEliminated && phase === 'pre_round' ? 'pointer' : 'default',
              }}
            >
              <div className="flex items-start gap-4">
                <PlayerAvatar playerId={id} name={p.name} size="md" onClick={e => { e.stopPropagation(); openPlayer(id); }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold" style={{ color: '#0a1f44' }}>{p.name}</span>
                    {isCap && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(217,154,0,0.15)', color: '#D99A00', border: '1px solid rgba(217,154,0,0.25)' }}>
                        CAPTAIN ⭐
                      </span>
                    )}
                    {isEliminated && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.1)', color: '#E5472B', border: '1px solid rgba(229,71,43,0.2)' }}>
                        OUT {exit}
                      </span>
                    )}
                    {isWinner && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(217,154,0,0.15)', color: '#D99A00', border: '1px solid rgba(217,154,0,0.25)' }}>
                        🏆 WINNER
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#5B6B84' }}>
                    <span>#{p.ranking} · {p.style}</span>
                    <span style={{ color: '#9AA7BC' }}>·</span>
                    <span className="font-num">${p.price}M paid</span>
                    {budgetReturn && (
                      <span className="font-num" style={{ color: '#D99A00' }}>
                        +${budgetReturn.amount}M returned ({Math.round(BUDGET_RETURN_RATES[budgetReturn.round] * 100)}%)
                      </span>
                    )}
                  </div>
                  {historyCap.length > 0 && (
                    <div className="text-xs mt-1" style={{ color: 'rgba(217,154,0,0.5)' }}>
                      Captained: {historyCap.join(', ')}
                    </div>
                  )}
                </div>
                <div className="hidden sm:flex flex-col items-end gap-2">
                  <SurfaceBar hard={p.surface.hard} clay={p.surface.clay} grass={p.surface.grass} highlight="grass" compact />
                </div>
              </div>

              {/* Per-round results */}
              {revealedRoundIds.length > 0 && (
                <div className="mt-3 pt-3 flex gap-2 flex-wrap" style={{ borderTop: '1px solid rgba(10,27,51,0.06)' }}>
                  {ROUNDS.filter(r => revealedRoundIds.includes(r.id as RoundId)).map(round => {
                    const match = MATCHES.find(
                      m => m.round === round.id && (m.p1Id === id || m.p2Id === id)
                    );
                    if (!match) return null;
                    const won = match.winnerId === id;
                    const wasCaptain = captainHistory.some(h => h.round === round.id && h.playerId === id);
                    const pts = won ? (wasCaptain ? round.points * 2 : round.points) : 0;
                    return (
                      <div
                        key={round.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                        style={{
                          background: won ? 'rgba(18,161,80,0.08)' : 'rgba(229,71,43,0.08)',
                          border: `1px solid ${won ? 'rgba(18,161,80,0.2)' : 'rgba(229,71,43,0.15)'}`,
                          color: won ? '#12A150' : '#E5472B',
                        }}
                      >
                        <span className="font-semibold">{round.short}</span>
                        <span className="font-num">{won ? `+${pts}` : '✗'}</span>
                        {wasCaptain && won && <span>⭐</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RivalTeamView({ id, currentRoundIndex }: { id: string; currentRoundIndex: number }) {
  const openPlayer = useGameStore(s => s.openPlayer);
  const team = getRivalTeams(currentRoundIndex).find(t => t.rival.id === id);
  if (!team) return null;
  const { rival, squad, spent, bought, captainId, score, transfers } = team;
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const inThisRound = new Set(transfers.map(t => t.in));
  const isOut = (pid: string) => { const e = getPlayerExit(pid); return e !== null && revealed.includes(e); };
  const eliminated = transfers.length + squad.filter(isOut).length;
  // Captain first, so it reads as the differentiated pick
  const ordered = [...squad].sort((a, b) => (a === captainId ? -1 : b === captainId ? 1 : 0));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 fade-in">
      <BackToLeague />

      {/* Club header: emblem + name + username, with total score at the same level */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(120deg,#0a1f44,#123163)' }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0" style={{ background: rival.color, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
            {rival.emblem}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight truncate">{rival.name}</h1>
            <div className="text-sm" style={{ color: '#AFBFDA' }}>{rival.manager} · {rival.tag}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-num text-4xl font-extrabold leading-none" style={{ color: '#F0C24B' }}>{score}</div>
            <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: '#8FA1BE' }}>Total score</div>
          </div>
        </div>
      </div>

      {/* Stats: players bought, money spent, players eliminated */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Players bought', value: bought, color: '#0a1f44' },
          { label: 'Money spent', value: `$${spent}M`, color: '#0e6fc4' },
          { label: 'Players eliminated', value: eliminated, color: '#E5472B' },
        ].map((c, i) => (
          <div key={i} className="rounded-2xl p-4 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
            <div className="font-num text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
            <div className="text-[11px] mt-0.5" style={{ color: '#5B6B84' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Squad — captain first & differentiated, tier colour-coded */}
      <div className="space-y-2">
        {ordered.map(pid => {
          const p = getPlayer(pid);
          const exit = getPlayerExit(pid);
          const out = isOut(pid);
          const isCap = captainId === pid;
          const tm = TIER_META[getTier(p.ranking)];
          return (
            <div key={pid} className="rounded-2xl p-4" style={{
              background: isCap ? 'rgba(217,154,0,0.06)' : '#FFFFFF',
              border: `1px solid ${isCap ? 'rgba(217,154,0,0.4)' : 'rgba(10,27,51,0.07)'}`,
              opacity: out ? 0.55 : 1,
            }}>
              {isCap && <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#D99A00' }}>⭐ Captain · 2× points</div>}
              <div className="flex items-center gap-4">
                <PlayerAvatar playerId={pid} name={p.name} size="md" onClick={() => openPlayer(pid)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold" style={{ color: '#0a1f44' }}>{p.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: tm.soft, color: tm.color, border: `1px solid ${tm.color}55` }}>{getTier(p.ranking)}</span>
                    {inThisRound.has(pid) && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(14,111,196,0.12)', color: '#0e6fc4' }}>SUB IN</span>}
                    {out && <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(229,71,43,0.1)', color: '#E5472B' }}>OUT {exit}</span>}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#5B6B84' }}>#{p.ranking} · <span className="font-num">${p.price}M</span></div>
                </div>
              </div>
              {revealed.length > 0 && (
                <div className="mt-3 pt-3 flex gap-2 flex-wrap" style={{ borderTop: '1px solid rgba(10,27,51,0.06)' }}>
                  {ROUNDS.filter(r => revealed.includes(r.id as RoundId)).map(round => {
                    const match = MATCHES.find(m => m.round === round.id && (m.p1Id === pid || m.p2Id === pid));
                    if (!match) return null;
                    const won = match.winnerId === pid;
                    const opp = getOpponentId(pid, round.id);
                    const bonus = won && opp ? upsetBonus(pid, opp) : 0;
                    const pts = won ? round.points + bonus : 0;
                    return (
                      <div key={round.id} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs" style={{
                        background: won ? 'rgba(18,161,80,0.08)' : 'rgba(229,71,43,0.08)',
                        border: `1px solid ${won ? 'rgba(18,161,80,0.2)' : 'rgba(229,71,43,0.15)'}`,
                        color: won ? '#12A150' : '#E5472B',
                      }}>
                        <span className="font-semibold">{round.short}</span>
                        <span className="font-num">{won ? `+${pts}` : '✗'}</span>
                        {bonus > 0 && <span title="upset bonus">🔥</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
