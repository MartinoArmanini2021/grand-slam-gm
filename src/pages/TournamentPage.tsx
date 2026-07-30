import { useState } from 'react';
import { useGameStore, eliminatedSquad, substitutionCandidates } from '../store/gameStore';
import { ROUNDS, getPlayerExit, isPlayerOut, transfersOpen, roundPlayable } from '../data/tournament';
import { getPlayer } from '../data/players';
import { lastName } from '../data/format';
import type { RoundId } from '../types';
import PlayerAvatar from '../components/PlayerAvatar';
import BracketTree from '../components/BracketTree';
import { getTier, TIER_META } from '../data/tiers';
import { TOURNAMENT } from '../data/tournamentConfig';
import { toast } from '../store/toastStore';

export default function TournamentPage() {
  const {
    phase, myTeam, captain, viceCaptain, currentRoundIndex, roundScores, myScore,
    playNextRound, continueToNextRound, budgetReturns, setActiveTab,
  } = useGameStore();

  const currentRound = phase !== 'draft' && phase !== 'finished' ? ROUNDS[currentRoundIndex] : null;
  // In round_complete the index has already advanced, so the card should name the
  // round that just finished, not the upcoming one.
  const headerRound = phase === 'round_complete' ? (ROUNDS[currentRoundIndex - 1] ?? currentRound) : currentRound;
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const aliveSquad = myTeam.filter(id => !isPlayerOut(id, revealed));
  // A round can be scored only once the real tournament has FINISHED it (every pairing
  // has a live result). Before the draw is played, nothing is playable — you're locked
  // in and waiting for the National Bank Open to begin.
  const playable = currentRound ? roundPlayable(currentRoundIndex) : false;
  // Ready to play once the round is live AND a captain is chosen — or all players are
  // out (nothing left to captain), so the tournament can still be played out.
  const canPlay = phase === 'pre_round' && playable && (!!captain || aliveSquad.length === 0);
  const playLabel = !playable ? '⏳ Awaiting live results'
    : canPlay ? `▶ Play ${currentRound!.label}`
    : 'Select a captain first';

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      <div className="mb-4">
        <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>{TOURNAMENT.edition} — the draw</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          The live men's singles bracket. Once the draw is out you can highlight any team's players and trace their route to the final.
        </p>
      </div>

      {/* ── Game controls ── */}
      {phase === 'finished' && (
        <div className="mb-6 px-6 py-5 rounded-2xl text-center" style={{ background: 'rgba(217,154,0,0.06)', border: '1px solid rgba(217,154,0,0.2)' }}>
          <div className="text-3xl mb-2">🏆</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--gold)' }}>Tournament Complete</h2>
          <div className="font-num text-2xl font-bold mb-3" style={{ color: 'var(--ink)' }}>{myScore} pts</div>
          <div className="flex justify-center gap-4 flex-wrap">
            {roundScores.map(rs => (
              <div key={rs.round} className="text-center">
                <div className="text-xs mb-1" style={{ color: 'var(--ink-2)' }}>{rs.round}</div>
                <div className="font-num text-sm font-bold" style={{ color: rs.points > 0 ? 'var(--green)' : 'var(--ink-3)' }}>+{rs.points}</div>
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
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-2)' }}>
                  {phase === 'pre_round' ? 'Up Next' : 'Round Complete'}
                </div>
                <div className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{(headerRound ?? currentRound).label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
                  Base +{(headerRound ?? currentRound).points} pts · ×ranking &amp; upset bonus · captain doubles
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs mb-0.5" style={{ color: 'var(--ink-2)' }}>Score</div>
                <div className="font-num text-2xl font-bold" style={{ color: 'var(--blue)' }}>{myScore}</div>
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            {phase === 'pre_round' && (
              <>
                {aliveSquad.length === 0 ? (
                  <p className="text-xs mb-4" style={{ color: 'var(--ink-2)' }}>All your players are out — play on to finish the tournament.</p>
                ) : (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-xs" style={{ color: 'var(--ink-2)' }}>Your leaders:</span>
                    <LeaderChip role="C" id={captain} />
                    <LeaderChip role="V" id={viceCaptain} />
                    <button onClick={() => setActiveTab('home')} className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                      Change on the pitch →
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    const label = currentRound.label;
                    playNextRound();
                    const rs = useGameStore.getState().roundScores;
                    const last = rs[rs.length - 1];
                    if (last) toast(last.points > 0 ? `+${last.points} points in the ${label}! 🎾` : `No points in the ${label}`, last.points > 0 ? 'good' : 'info');
                  }}
                  disabled={!canPlay}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: canPlay ? 'var(--blue)' : 'rgba(10,27,51,0.05)',
                    color: canPlay ? '#fff' : 'var(--ink-3)',
                    cursor: canPlay ? 'pointer' : 'not-allowed',
                  }}
                >
                  {playLabel}
                </button>
              </>
            )}

            {phase === 'round_complete' && (
              <div>
                {budgetReturns
                  .filter(r => r.round === ROUNDS[currentRoundIndex - 1]?.id)
                  .map(ret => (
                    <div key={ret.playerId} className="text-sm mb-1.5 flex items-center gap-2">
                      <span style={{ color: 'var(--ink-2)' }}>💸</span>
                      <span style={{ color: 'var(--ink)' }}>{getPlayer(ret.playerId).name}</span>
                      <span style={{ color: 'var(--ink-2)' }}>eliminated →</span>
                      <span className="font-num font-semibold" style={{ color: 'var(--gold)' }}>+${ret.amount}M returned</span>
                    </div>
                  ))}
                {currentRoundIndex < ROUNDS.length && (
                  <button
                    className="mt-3 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                    onClick={continueToNextRound}
                    style={{ background: 'rgba(14,111,196,0.12)', border: '1px solid rgba(14,111,196,0.25)', color: 'var(--blue)' }}
                  >
                    Continue to {ROUNDS[currentRoundIndex]?.label} →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transfers ── */}
      <TransfersPanel />

      {/* ── The live tournament draw (empty until pairings publish) ── */}
      <BracketTree />
    </div>
  );
}

// A read-only chip for the round's captain / vice — the picks are made on the pitch (Home).
function LeaderChip({ role, id }: { role: 'C' | 'V'; id: string | null }) {
  if (!id) return null;
  const p = getPlayer(id);
  const isC = role === 'C';
  const color = isC ? 'var(--gold)' : '#3f6ea5';
  return (
    <span className="inline-flex items-center gap-1.5 pl-0.5 pr-1.5 py-0.5 rounded-full" style={{ background: isC ? 'rgba(217,154,0,0.1)' : 'rgba(14,111,196,0.08)', border: `1px solid ${isC ? 'rgba(217,154,0,0.3)' : 'rgba(14,111,196,0.25)'}` }}>
      <PlayerAvatar playerId={id} name={p.name} size="sm" />
      <span className="text-[12px] font-bold" style={{ color: 'var(--ink)' }}>{lastName(p.name)}</span>
      <span className="text-[9px] font-extrabold px-1 py-0.5 rounded" style={{ background: color, color: '#fff' }}>{isC ? 'C ×2' : 'V ×1.5'}</span>
    </span>
  );
}

function TransfersPanel() {
  const { myTeam, budget, currentRoundIndex, phase, replacePlayer } = useGameStore();
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (phase !== 'round_complete' && phase !== 'pre_round') return null;
  const outs = eliminatedSquad(myTeam, currentRoundIndex);
  if (outs.length === 0) return null;

  // Transfer window closes after the semi-finals.
  if (!transfersOpen(currentRoundIndex)) {
    return (
      <div className="mb-6 rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background: 'rgba(10,27,51,0.03)', border: '1px solid rgba(10,27,51,0.1)' }}>
        <div className="text-xl">🔒</div>
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Transfer window closed</div>
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>No purchases after the semi-finals — your squad is locked for the final.</div>
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
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Transfers <span className="font-normal" style={{ color: 'var(--ink-3)' }}>· window closes after the SF</span></div>
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>Replace an eliminated player with anyone still in the draw · scores from {nextRound}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-num text-lg font-extrabold" style={{ color: 'var(--gold)' }}>${budget.toFixed(1)}M</div>
          <div className="text-[10px]" style={{ color: 'var(--ink-3)' }}>available</div>
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
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--ember)' }}>OUT {exit} · <span className="font-num" style={{ color: 'var(--ink-2)' }}>${p.price}M spent</span></div>
                </div>
                <button
                  onClick={() => setOpenFor(isOpen ? null : id)}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: isOpen ? 'rgba(10,27,51,0.06)' : 'var(--blue)', color: isOpen ? 'var(--ink-2)' : '#fff' }}
                >
                  {isOpen ? 'Cancel' : 'Replace →'}
                </button>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 fade-in">
                  {candidates.length === 0 ? (
                    <div className="text-xs text-center py-3" style={{ color: 'var(--ink-3)' }}>
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
                              <div className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{c.name}</div>
                              <div className="text-[10px]" style={{ color: tier.color }}>{getTier(c.ranking)} · #{c.ranking}</div>
                            </div>
                            <div className="font-num text-sm font-bold shrink-0" style={{ color: 'var(--blue)' }}>${c.price}M</div>
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
