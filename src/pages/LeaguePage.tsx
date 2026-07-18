import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { useLeagueBoard } from '../data/leagueBoard';
import { lastName } from '../data/format';
import { ROUNDS, isPlayerOut, getPlayerExit } from '../data/tournament';
import PlayerAvatar from '../components/PlayerAvatar';
import { toast } from '../store/toastStore';
import type { RoundId } from '../types';

const MEDAL = ['#E8B923', '#AEB6C2', '#C77B3B']; // gold, silver, bronze

function RankBadge({ i }: { i: number }) {
  const top = i < 3;
  return (
    <div
      className="shrink-0 flex items-center justify-center font-num font-extrabold"
      style={{
        width: 34, height: 34, borderRadius: 10,
        background: top ? MEDAL[i] : '#EEF1F5',
        color: top ? '#fff' : '#9AA7BC',
        fontSize: top ? 15 : 13,
        boxShadow: top ? `0 2px 8px ${MEDAL[i]}66, inset 0 0 0 2px rgba(255,255,255,0.35)` : 'none',
      }}
    >
      {i + 1}
    </div>
  );
}

export default function LeaguePage() {
  const { myTeam, currentRoundIndex, openTeam } = useGameStore();
  const [view, setView] = useState<'public' | 'private'>('public');

  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id) as RoundId[];
  const rows = useLeagueBoard();

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-3 py-6 fade-in">
      {/* Public / Private league selector */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {([['public', '🌍', 'Public Leagues', 'Play against everyone'], ['private', '🔒', 'Private Leagues', 'Invite-only friends']] as const).map(([v, icon, label, sub]) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className="rounded-2xl px-4 py-3 text-left transition-all"
              style={{
                background: active ? 'linear-gradient(120deg,#0a1f44,#123163)' : '#FFFFFF',
                border: `1px solid ${active ? 'transparent' : 'rgba(10,27,51,0.1)'}`,
                boxShadow: active ? '0 6px 20px rgba(10,27,51,0.18)' : 'none',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="font-extrabold text-sm" style={{ color: active ? '#fff' : '#0a1f44' }}>{label}</span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: active ? '#AFBFDA' : '#9AA7BC' }}>{sub}</div>
            </button>
          );
        })}
      </div>

      {view === 'private' ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.09)' }}>
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-lg font-extrabold mb-1" style={{ color: '#0a1f44' }}>Private Leagues</h3>
          <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: '#5B6B84' }}>
            Play only against friends you invite. Create a league to get a shareable invite code, or join one with a code.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={() => toast('Private leagues arrive with accounts (Go-Live)', 'info')} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#0e6fc4' }}>Create a league</button>
            <button onClick={() => toast('Private leagues arrive with accounts (Go-Live)', 'info')} className="px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'rgba(14,111,196,0.1)', color: '#0e6fc4' }}>Join with a code</button>
          </div>
          <p className="text-xs mt-5" style={{ color: '#9AA7BC' }}>Available once accounts are enabled.</p>
        </div>
      ) : (
      <>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h2 className="text-sm font-bold" style={{ color: '#5B6B84' }}>Wimbledon 2026 Open League · {rows.length} managers</h2>
        {myTeam.length > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(55,214,122,0.14)', color: '#12A150' }}>✓ You're in</span>}
      </div>

      {/* Standings */}
      <div className="space-y-2.5">
        {rows.map((row, i) => (
          <button
            key={row.id}
            onClick={() => openTeam(row.id)}
            className="w-full block text-left rounded-2xl px-4 py-3.5 transition-all hover:brightness-[0.985]"
            style={{
              background: row.you ? 'rgba(14,111,196,0.05)' : '#FFFFFF',
              border: `1px solid ${row.you ? 'rgba(14,111,196,0.3)' : 'rgba(10,27,51,0.08)'}`,
              boxShadow: '0 1px 2px rgba(10,27,51,0.04)',
            }}
          >
            {/* Top line: rank · logo · name · score/budget */}
            <div className="flex items-center gap-3">
              <RankBadge i={i} />
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${row.color}1a`, border: `1px solid ${row.color}55` }}>
                {row.emblem}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm truncate" style={{ color: '#0a1f44' }}>{row.name}</span>
                  {row.you && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#0e6fc4', color: '#fff' }}>YOU</span>}
                </div>
                <div className="text-[11px] truncate" style={{ color: '#9AA7BC' }}>{row.motto}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-num text-xl font-extrabold leading-none" style={{ color: '#0e6fc4' }}>{row.score} <span className="text-[10px] font-semibold" style={{ color: '#9AA7BC' }}>pts</span></div>
                <div className="font-num text-[11px] font-semibold mt-1" style={{ color: '#12A150' }}>${row.budget.toFixed(1)}M left</div>
              </div>
            </div>

            {/* Squad — names + in/out status */}
            <div className="mt-3 pt-3 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid rgba(10,27,51,0.06)' }}>
              {row.squad.map(id => {
                const out = isPlayerOut(id, revealed);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full"
                    style={{
                      background: out ? 'rgba(229,71,43,0.08)' : 'rgba(18,161,80,0.08)',
                      border: `1px solid ${out ? 'rgba(229,71,43,0.22)' : 'rgba(18,161,80,0.22)'}`,
                      opacity: out ? 0.7 : 1,
                    }}
                    title={out ? `Out — ${getPlayerExit(id)}` : 'Still in'}
                  >
                    <PlayerAvatar playerId={id} name={getPlayer(id).name} size="sm" />
                    <span className="text-[11px] font-semibold" style={{ color: out ? '#9AA7BC' : '#0a1f44', textDecoration: out ? 'line-through' : 'none' }}>
                      {lastName(getPlayer(id).name)}
                    </span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: out ? '#E5472B' : '#12A150', display: 'inline-block' }} />
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>

      {myTeam.length === 0 && (
        <p className="text-center text-sm mt-6" style={{ color: '#9AA7BC' }}>Draft your squad to join the standings.</p>
      )}
      </>
      )}
    </div>
  );
}
