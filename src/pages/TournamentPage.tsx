import { useState } from 'react';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { ROUNDS, getPlayerExit, transfersOpen } from '../data/tournament';
import { getPlayer } from '../data/players';
import PlayerAvatar from '../components/PlayerAvatar';
import BracketTree from '../components/BracketTree';
import { getTier, TIER_META } from '../data/tiers';
import { toast } from '../store/toastStore';

export default function TournamentPage() {
  const {
    phase, myTeam, captain, currentRoundIndex, roundScores, myScore,
    setCaptain, playNextRound, budgetReturns,
  } = useGameStore();

  const currentRound = phase !== 'draft' && phase !== 'finished' ? ROUNDS[currentRoundIndex] : null;
  const isCaptainSet = phase === 'pre_round' && !!captain;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 fade-in">
      <div className="mb-5">
        <h1 className="text-lg font-extrabold" style={{ color: '#0a1f44' }}>Wimbledon 2026 — the draw</h1>
        <p className="text-xs mt-0.5" style={{ color: '#5B6B84' }}>
          The real men's singles bracket. Your players are highlighted — tap anyone to trace their route to the final.
        </p>
      </div>

      {/* ── Game controls ── */}
      {phase === 'draft' && (
        <div className="mb-6 px-5 py-4 rounded-2xl text-sm" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)', color: '#5B6B84' }}>
          Complete your draft in the Market to start playing the bracket.
        </div>
      )}

      {phase === 'finished' && (
        <div className="mb-6 px-6 py-5 rounded-2xl text-center" style={{ background: 'rgba(217,154,0,0.06)', border: '1px solid rgba(217,154,0,0.2)' }}>
          <div className="text-3xl mb-2">🏆</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: '#D99A00' }}>Tournament Complete</h2>
          <div className="font-num text-2xl font-bold mb-3" style={{ color: '#0a1f44' }}>{myScore} pts</div>
          <div className="flex justify-center gap-4 flex-wrap">
            {roundScores.map(rs => (
              <div key={rs.round} className="text-center">
                <div className="text-xs mb-1" style={{ color: '#5B6B84' }}>{rs.round}</div>
                <div className="font-num text-sm font-bold" style={{ color: rs.points > 0 ? '#12A150' : '#9AA7BC' }}>+{rs.points}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(phase === 'pre_round' || phase === 'round_complete') && currentRound && (
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(10,27,51,0.07)' }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#5B6B84' }}>
                  {phase === 'pre_round' ? 'Up Next' : 'Round Complete'}
                </div>
                <div className="text-lg font-bold" style={{ color: '#0a1f44' }}>{currentRound.label}</div>
                <div className="text-xs mt-0.5" style={{ color: '#5B6B84' }}>
                  Win = +{currentRound.points} pts · Captain win = +{currentRound.points * 2} pts
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs mb-0.5" style={{ color: '#5B6B84' }}>Score</div>
                <div className="font-num text-2xl font-bold" style={{ color: '#0e6fc4' }}>{myScore}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            {phase === 'pre_round' && (
              <>
                <p className="text-xs mb-3" style={{ color: '#D99A00' }}>Choose your captain — they score 2× points if they win</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {myTeam.map(id => {
                    const p = getPlayer(id);
                    const isCap = captain === id;
                    return (
                      <button
                        key={id}
                        onClick={() => { setCaptain(id); toast(`${p.name.split(' ').slice(-1)[0]} is your captain ⭐`, 'info'); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all"
                        style={{
                          background: isCap ? 'rgba(217,154,0,0.1)' : 'rgba(10,27,51,0.04)',
                          border: `1px solid ${isCap ? 'rgba(217,154,0,0.3)' : 'rgba(10,27,51,0.07)'}`,
                          color: isCap ? '#D99A00' : '#0a1f44',
                          fontWeight: isCap ? 600 : 400,
                        }}
                      >
                        {p.flag} {p.name.split(' ').slice(-1)[0]}
                        {isCap && <span>⭐</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    const label = currentRound.label;
                    playNextRound();
                    const rs = useGameStore.getState().roundScores;
                    const last = rs[rs.length - 1];
                    if (last) toast(last.points > 0 ? `+${last.points} points in the ${label}! 🎾` : `No points in the ${label}`, last.points > 0 ? 'good' : 'info');
                  }}
                  disabled={!isCaptainSet}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: isCaptainSet ? '#0e6fc4' : 'rgba(10,27,51,0.05)',
                    color: isCaptainSet ? '#fff' : '#9AA7BC',
                    cursor: isCaptainSet ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isCaptainSet ? `▶ Play ${currentRound.label}` : 'Select a captain first'}
                </button>
              </>
            )}

            {phase === 'round_complete' && (
              <div>
                {budgetReturns
                  .filter(r => r.round === ROUNDS[currentRoundIndex - 1]?.id)
                  .map(ret => (
                    <div key={ret.playerId} className="text-sm mb-1.5 flex items-center gap-2">
                      <span style={{ color: '#5B6B84' }}>💸</span>
                      <span style={{ color: '#0a1f44' }}>{getPlayer(ret.playerId).name}</span>
                      <span style={{ color: '#5B6B84' }}>eliminated →</span>
                      <span className="font-num font-semibold" style={{ color: '#D99A00' }}>+${ret.amount}M returned</span>
                    </div>
                  ))}
                {currentRoundIndex < ROUNDS.length && (
                  <button
                    className="mt-3 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                    onClick={() => useGameStore.setState({ phase: 'pre_round' })}
                    style={{ background: 'rgba(14,111,196,0.12)', border: '1px solid rgba(14,111,196,0.25)', color: '#0e6fc4' }}
                  >
                    Set Captain for {ROUNDS[currentRoundIndex]?.label} →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transfers ── */}
      <TransfersPanel />

      {/* ── The real Wimbledon 2026 draw ── */}
      <BracketTree />
    </div>
  );
}

function TransfersPanel() {
  const { myTeam, budget, currentRoundIndex, phase, replacePlayer } = useGameStore();
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (phase !== 'round_complete' && phase !== 'pre_round') return null;
  const outs = eliminatedSquad(myTeam, currentRoundIndex);
  if (outs.length === 0) return null;

  // Transfer window closes after the quarter-finals.
  if (!transfersOpen(currentRoundIndex)) {
    return (
      <div className="mb-6 rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background: 'rgba(10,27,51,0.03)', border: '1px solid rgba(10,27,51,0.1)' }}>
        <div className="text-xl">🔒</div>
        <div>
          <div className="text-sm font-bold" style={{ color: '#0a1f44' }}>Transfer window closed</div>
          <div className="text-xs" style={{ color: '#5B6B84' }}>No purchases after the quarter-finals — your squad is locked for the semis &amp; final.</div>
        </div>
      </div>
    );
  }

  const candidates = substitutionCandidates(myTeam, budget, currentRoundIndex);
  const nextRound = ROUNDS[currentRoundIndex]?.label ?? 'the next round';

  return (
    <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid rgba(217,154,0,0.35)' }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(217,154,0,0.08)', borderBottom: '1px solid rgba(217,154,0,0.2)' }}>
        <div>
          <div className="text-sm font-bold" style={{ color: '#0a1f44' }}>Transfers <span className="font-normal" style={{ color: '#9AA7BC' }}>· window closes after the QF</span></div>
          <div className="text-xs" style={{ color: '#5B6B84' }}>Replace an eliminated player with anyone still in the draw · scores from {nextRound}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-num text-lg font-extrabold" style={{ color: '#D99A00' }}>${budget.toFixed(1)}M</div>
          <div className="text-[10px]" style={{ color: '#9AA7BC' }}>available</div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {outs.map(id => {
          const p = getPlayer(id);
          const exit = getPlayerExit(id);
          const isOpen = openFor === id;
          return (
            <div key={id} className="rounded-xl" style={{ background: 'rgba(10,27,51,0.03)', border: '1px solid rgba(10,27,51,0.06)' }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <PlayerAvatar playerId={id} name={p.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: '#0a1f44' }}>{p.name}</div>
                  <div className="text-[11px]" style={{ color: '#E5472B' }}>OUT {exit} · <span className="font-num" style={{ color: '#5B6B84' }}>${p.price}M spent</span></div>
                </div>
                <button
                  onClick={() => setOpenFor(isOpen ? null : id)}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: isOpen ? 'rgba(10,27,51,0.06)' : '#0e6fc4', color: isOpen ? '#5B6B84' : '#fff' }}
                >
                  {isOpen ? 'Cancel' : 'Replace →'}
                </button>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 fade-in">
                  {candidates.length === 0 ? (
                    <div className="text-xs text-center py-3" style={{ color: '#9AA7BC' }}>
                      No affordable replacements left in the draw (budget ${budget.toFixed(1)}M).
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1 pt-1">
                      {candidates.map(c => {
                        const tier = TIER_META[getTier(c.ranking)];
                        return (
                          <button
                            key={c.id}
                            onClick={() => { replacePlayer(id, c.id); setOpenFor(null); toast(`Transferred in ${c.name}`, 'good'); }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all hover:brightness-[0.98]"
                            style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}
                          >
                            <PlayerAvatar playerId={c.id} name={c.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold truncate" style={{ color: '#0a1f44' }}>{c.name}</div>
                              <div className="text-[10px]" style={{ color: tier.color }}>{getTier(c.ranking)} · #{c.ranking}</div>
                            </div>
                            <div className="font-num text-sm font-bold shrink-0" style={{ color: '#0e6fc4' }}>${c.price}M</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
