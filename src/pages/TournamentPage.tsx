import { useState } from 'react';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { ROUNDS, getMatchesForRound, getPlayerExit, transfersOpen } from '../data/tournament';
import { getPlayer } from '../data/players';
import PlayerAvatar from '../components/PlayerAvatar';
import { getTier, TIER_META } from '../data/tiers';
import type { RoundId } from '../types';

export default function TournamentPage() {
  const {
    phase, myTeam, captain, currentRoundIndex, roundScores, myScore,
    setCaptain, playNextRound, budgetReturns, budget,
  } = useGameStore();

  const captainHistory = useGameStore(s => s.captainHistory);
  const [viewRound, setViewRound] = useState<RoundId>(ROUNDS[0].id);

  const revealedUpTo = phase === 'draft' ? -1 : currentRoundIndex - 1;
  const isRoundRevealed = (idx: number) => idx <= revealedUpTo;
  const currentRound = phase !== 'draft' && phase !== 'finished' ? ROUNDS[currentRoundIndex] : null;
  const isCaptainSet = phase === 'pre_round' && !!captain;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 fade-in">

      {/* ── Status card ── */}
      {phase === 'draft' && (
        <div className="mb-6 px-5 py-4 rounded-2xl text-sm" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)', color: '#5B6B84' }}>
          Complete your draft to start playing the bracket.
        </div>
      )}

      {phase === 'finished' && (
        <div className="mb-6 px-6 py-5 rounded-2xl text-center" style={{ background: 'rgba(217,154,0,0.06)', border: '1px solid rgba(217,154,0,0.2)' }}>
          <div className="text-3xl mb-2">🏆</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: '#D99A00' }}>Tournament Complete</h2>
          <div className="font-num text-2xl font-bold mb-3" style={{ color: '#0A1B33' }}>{myScore} pts</div>
          <div className="flex justify-center gap-4">
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
                <div className="text-lg font-bold" style={{ color: '#0A1B33' }}>{currentRound.label}</div>
                <div className="text-xs mt-0.5" style={{ color: '#5B6B84' }}>
                  Win = +{currentRound.points} pts · Captain win = +{currentRound.points * 2} pts
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs mb-0.5" style={{ color: '#5B6B84' }}>Score</div>
                <div className="font-num text-2xl font-bold" style={{ color: '#1466D6' }}>{myScore}</div>
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
                        onClick={() => setCaptain(id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all"
                        style={{
                          background: isCap ? 'rgba(217,154,0,0.1)' : 'rgba(10,27,51,0.04)',
                          border: `1px solid ${isCap ? 'rgba(217,154,0,0.3)' : 'rgba(10,27,51,0.07)'}`,
                          color: isCap ? '#D99A00' : '#0A1B33',
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
                  onClick={playNextRound}
                  disabled={!isCaptainSet}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: isCaptainSet ? '#1466D6' : 'rgba(10,27,51,0.05)',
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
                      <span style={{ color: '#0A1B33' }}>{getPlayer(ret.playerId).name}</span>
                      <span style={{ color: '#5B6B84' }}>eliminated →</span>
                      <span className="font-num font-semibold" style={{ color: '#D99A00' }}>+${ret.amount}M returned</span>
                    </div>
                  ))}
                {currentRoundIndex < ROUNDS.length && (
                  <button
                    className="mt-3 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                    onClick={() => useGameStore.setState({ phase: 'pre_round' })}
                    style={{ background: 'rgba(20,102,214,0.12)', border: '1px solid rgba(20,102,214,0.25)', color: '#1466D6' }}
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

      {/* ── Round tabs ── */}
      <div className="flex gap-1 mb-5 p-1 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}>
        {ROUNDS.map((round, idx) => {
          const revealed = isRoundRevealed(idx);
          const isCurrent = phase !== 'draft' && currentRoundIndex === idx;
          const active = viewRound === round.id;
          return (
            <button
              key={round.id}
              onClick={() => setViewRound(round.id)}
              className="flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              style={{
                background: active ? 'rgba(20,102,214,0.15)' : 'transparent',
                color: active ? '#1466D6' : revealed ? '#5B6B84' : '#9AA7BC',
              }}
            >
              {round.short}
              {isCurrent && (
                <span className="w-1.5 h-1.5 rounded-full pulse-dot inline-block" style={{ background: '#1466D6' }} />
              )}
              {revealed && !active && (
                <span className="w-1 h-1 rounded-full inline-block" style={{ background: '#12A150' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Matches ── */}
      <RoundMatches
        roundId={viewRound}
        myTeam={myTeam}
        captain={captain}
        roundIndex={ROUNDS.findIndex(r => r.id === viewRound)}
        revealed={isRoundRevealed(ROUNDS.findIndex(r => r.id === viewRound))}
        captainHistory={captainHistory}
      />
    </div>
  );
}

function RoundMatches({
  roundId, myTeam, captain, roundIndex, revealed, captainHistory,
}: {
  roundId: RoundId;
  myTeam: string[];
  captain: string | null;
  roundIndex: number;
  revealed: boolean;
  captainHistory: { round: RoundId; playerId: string }[];
}) {
  const matches = getMatchesForRound(roundId);
  const roundPts = ROUNDS[roundIndex]?.points ?? 0;
  const roundCaptain = captainHistory.find(c => c.round === roundId)?.playerId ?? null;

  return (
    <div className="space-y-2">
      {matches.length === 0 && (
        <div className="text-center py-12 text-sm" style={{ color: '#9AA7BC' }}>No matches this round</div>
      )}
      {matches.map(match => {
        const p1 = getPlayer(match.p1Id);
        const p2 = getPlayer(match.p2Id);
        const p1Mine = myTeam.includes(match.p1Id);
        const p2Mine = myTeam.includes(match.p2Id);
        const p1Cap = roundCaptain === match.p1Id;
        const p2Cap = roundCaptain === match.p2Id;
        const hasMyPlayer = p1Mine || p2Mine;

        return (
          <div
            key={match.id}
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl"
            style={{
              background: hasMyPlayer ? 'rgba(20,102,214,0.04)' : '#FFFFFF',
              border: `1px solid ${hasMyPlayer ? 'rgba(20,102,214,0.12)' : 'rgba(10,27,51,0.07)'}`,
            }}
          >
            <PlayerCell
              player={p1} isMine={p1Mine} isCaptain={p1Cap}
              isWinner={revealed ? match.winnerId === match.p1Id : undefined}
            />

            <div className="shrink-0 text-center w-14 py-1">
              {revealed ? (
                <>
                  <div className="text-[9px] mb-0.5" style={{ color: '#9AA7BC' }}>vs</div>
                  <div className="text-[9px] leading-tight" style={{ color: '#5B6B84' }}>
                    {match.score.split(', ').join('\n')}
                  </div>
                </>
              ) : (
                <span className="text-xs font-bold" style={{ color: '#9AA7BC' }}>VS</span>
              )}
            </div>

            <PlayerCell
              player={p2} isMine={p2Mine} isCaptain={p2Cap}
              isWinner={revealed ? match.winnerId === match.p2Id : undefined}
            />

            {/* Points */}
            <div className="w-14 text-right shrink-0">
              {revealed && p1Mine && (
                <div className="font-num text-sm font-bold" style={{ color: match.winnerId === match.p1Id ? '#12A150' : '#E5472B' }}>
                  {match.winnerId === match.p1Id ? `+${p1Cap ? roundPts * 2 : roundPts}${p1Cap ? '⭐' : ''}` : '✗'}
                </div>
              )}
              {revealed && p2Mine && (
                <div className="font-num text-sm font-bold" style={{ color: match.winnerId === match.p2Id ? '#12A150' : '#E5472B' }}>
                  {match.winnerId === match.p2Id ? `+${p2Cap ? roundPts * 2 : roundPts}${p2Cap ? '⭐' : ''}` : '✗'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerCell({
  player, isMine, isCaptain, isWinner,
}: {
  player: ReturnType<typeof getPlayer>;
  isMine: boolean;
  isCaptain: boolean;
  isWinner: boolean | undefined;
}) {
  return (
    <div
      className="flex-1 flex items-center gap-2 px-2 py-1 rounded-xl min-w-0"
      style={{
        background: isMine && isWinner === true ? 'rgba(18,161,80,0.08)'
          : isMine && isWinner === false ? 'rgba(229,71,43,0.06)'
          : isMine ? 'rgba(10,27,51,0.04)'
          : 'transparent',
      }}
    >
      <PlayerAvatar playerId={player.id} name={player.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div
          className="text-xs font-medium leading-tight truncate"
          style={{ color: isMine ? '#0A1B33' : '#5B6B84' }}
        >
          {player.name}
          {isCaptain && <span className="ml-1" style={{ color: '#D99A00' }}>⭐</span>}
        </div>
        <div className="font-num text-[10px]" style={{ color: '#9AA7BC' }}>
          {player.seed ? `[${player.seed}]` : `#${player.ranking}`}
        </div>
      </div>
      {isWinner === true && <span className="text-xs shrink-0" style={{ color: '#12A150' }}>✓</span>}
      {isWinner === false && <span className="text-xs shrink-0" style={{ color: '#E5472B' }}>✗</span>}
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
          <div className="text-sm font-bold" style={{ color: '#0A1B33' }}>Transfer window closed</div>
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
          <div className="text-sm font-bold" style={{ color: '#0A1B33' }}>Transfers <span className="font-normal" style={{ color: '#9AA7BC' }}>· window closes after the QF</span></div>
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
                  <div className="text-sm font-semibold truncate" style={{ color: '#0A1B33' }}>{p.name}</div>
                  <div className="text-[11px]" style={{ color: '#E5472B' }}>OUT {exit} · <span className="font-num" style={{ color: '#5B6B84' }}>${p.price}M spent</span></div>
                </div>
                <button
                  onClick={() => setOpenFor(isOpen ? null : id)}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: isOpen ? 'rgba(10,27,51,0.06)' : '#1466D6', color: isOpen ? '#5B6B84' : '#fff' }}
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
                            onClick={() => { replacePlayer(id, c.id); setOpenFor(null); }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all hover:brightness-[0.98]"
                            style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.07)' }}
                          >
                            <PlayerAvatar playerId={c.id} name={c.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold truncate" style={{ color: '#0A1B33' }}>{c.name}</div>
                              <div className="text-[10px]" style={{ color: tier.color }}>{getTier(c.ranking)} · #{c.ranking}</div>
                            </div>
                            <div className="font-num text-sm font-bold shrink-0" style={{ color: '#1466D6' }}>${c.price}M</div>
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
