import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { getPlayerExit, isPlayerOut, ROUNDS } from '../data/tournament';
import PlayerAvatar from './PlayerAvatar';
import PlayerPickerModal from './PlayerPickerModal';

// Six on-court positions (as % of the whole box). 3 per half, net down the middle.
const SPOTS = [
  { x: 21, y: 30 }, { x: 31, y: 52 }, { x: 21, y: 74 }, // left half
  { x: 79, y: 30 }, { x: 69, y: 52 }, { x: 79, y: 74 }, // right half
];

export default function SquadCourt({ squad, captainId, readOnly, teamName, emblem, onTeamClick }: {
  squad?: string[];        // when given, renders this squad instead of your own (read-only)
  captainId?: string;
  readOnly?: boolean;
  teamName?: string;       // team identity shown inside the court (top-left)
  emblem?: string;
  onTeamClick?: () => void; // makes the team label a link (e.g. to your team page)
} = {}) {
  const { myTeam, captain, currentRoundIndex, phase, openPlayer, removePlayer } = useGameStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const team = squad ?? myTeam;
  const cap = captainId ?? (squad ? undefined : captain);
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
  const canEdit = !readOnly && !squad && phase === 'draft';

  return (
    <>
      <div className="relative w-full mx-auto rounded-2xl overflow-hidden select-none" style={{ aspectRatio: '16 / 9', maxWidth: 860, boxShadow: '0 10px 34px rgba(10,27,51,0.22)' }}>
        {/* Stadium + grass court (horizontal) */}
        <svg viewBox="0 0 640 360" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="stand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#123420" />
              <stop offset="1" stopColor="#0c2417" />
            </linearGradient>
          </defs>

          {/* Stands (stadium bowl) — concentric bands, lighter toward the court */}
          <rect x="0" y="0" width="640" height="360" fill="url(#stand)" />
          <rect x="22" y="22" width="596" height="316" rx="14" fill="#163d25" />
          <rect x="40" y="40" width="560" height="280" rx="10" fill="#1b4a2d" />
          {/* crowd speckle in the four stand bands */}
          {Array.from({ length: 160 }).map((_, i) => {
            const edge = i % 4;
            const t = ((i * 12.7) % 100) / 100;
            const row = i % 3;
            let cx = 0, cy = 0;
            if (edge === 0) { cx = 30 + t * 580; cy = 8 + row * 10; }          // top
            else if (edge === 1) { cx = 30 + t * 580; cy = 326 + row * 9; }    // bottom
            else if (edge === 2) { cx = 6 + row * 11; cy = 30 + t * 300; }     // left
            else { cx = 606 + row * 11; cy = 30 + t * 300; }                   // right
            return <circle key={i} cx={cx} cy={cy} r="1.6" fill={i % 2 ? '#dfe6d8' : '#9fb6a0'} opacity="0.5" />;
          })}

          {/* Grass court, inset (leaves the stand margin visible) */}
          <g>
            {/* mow stripes (vertical bands) */}
            {Array.from({ length: 13 }).map((_, i) => (
              <rect key={i} x={60 + i * 40} y="60" width="40" height="240" fill={i % 2 ? '#3f8347' : '#367038'} />
            ))}
            {/* court lines */}
            <g stroke="#ffffff" strokeOpacity="0.94" strokeWidth="2" fill="none">
              <rect x="60" y="60" width="520" height="240" />       {/* doubles */}
              <line x1="60" y1="90" x2="580" y2="90" />              {/* top singles sideline */}
              <line x1="60" y1="270" x2="580" y2="270" />           {/* bottom singles sideline */}
              <line x1="180" y1="90" x2="180" y2="270" />           {/* left service line */}
              <line x1="460" y1="90" x2="460" y2="270" />           {/* right service line */}
              <line x1="180" y1="180" x2="460" y2="180" />          {/* centre service line */}
            </g>
            {/* net (vertical, centre) */}
            <line x1="320" y1="52" x2="320" y2="308" stroke="#eef4f0" strokeWidth="4" strokeOpacity="0.96" />
            <line x1="320" y1="52" x2="320" y2="308" stroke="#0a1f44" strokeWidth="1" strokeOpacity="0.22" strokeDasharray="3 3" />
          </g>
        </svg>

        {/* Team identity — logo + name, top-left (links to your team page) */}
        {teamName && (
          <button
            onClick={onTeamClick}
            disabled={!onTeamClick}
            className="absolute top-3 left-3 flex items-center gap-2.5 transition-opacity hover:opacity-90"
            style={{ cursor: onTeamClick ? 'pointer' : 'default' }}
            title={onTeamClick ? 'Open your team' : undefined}
          >
            <span className="flex items-center justify-center rounded-xl text-xl shrink-0" style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)' }}>{emblem}</span>
            <span className="text-lg font-extrabold text-white" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.5)' }}>{teamName}</span>
            {onTeamClick && <span className="text-white text-lg leading-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>›</span>}
          </button>
        )}

        {/* Players / empty slots */}
        {SPOTS.map((spot, i) => {
          const id = team[i];
          if (!id) {
            return (
              <button
                key={i}
                onClick={() => canEdit && setPickerOpen(true)}
                disabled={!canEdit}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: `${spot.x}%`, top: `${spot.y}%`, cursor: canEdit ? 'pointer' : 'default' }}
              >
                <div className="rounded-full flex items-center justify-center transition-transform" style={{
                  width: 46, height: 46,
                  background: 'rgba(12,26,46,0.42)',
                  border: canEdit ? '2px dashed rgba(255,255,255,0.5)' : '2px solid rgba(255,255,255,0.18)',
                }}>
                  {canEdit && <span className="text-white/80 text-xl leading-none font-light">+</span>}
                </div>
                {canEdit && <span className="mt-1 text-[9px] font-semibold text-white/70">Add</span>}
              </button>
            );
          }
          const p = getPlayer(id);
          const out = isPlayerOut(id, revealed);
          const exit = getPlayerExit(id);
          const isCap = cap === id;
          return (
            <button
              key={i}
              onClick={() => (canEdit ? setManageId(id) : openPlayer(id))}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${spot.x}%`, top: `${spot.y}%`, opacity: out ? 0.5 : 1 }}
            >
              <div className="relative" style={isCap ? { filter: 'drop-shadow(0 0 6px rgba(217,154,0,0.7))' } : undefined}>
                <PlayerAvatar playerId={id} name={p.name} size="md" />
                {isCap && (
                  <span className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-[9px] font-extrabold" style={{ width: 16, height: 16, background: 'var(--gold)', color: '#fff', border: '1.5px solid #fff' }}>C</span>
                )}
              </div>
              <div className="mt-1 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap" style={{ background: 'rgba(10,31,68,0.82)' }}>
                <span className="text-[10px] font-bold text-white leading-none">{p.name.split(' ').slice(-1)[0]}</span>
                <span className="font-num text-[9px] leading-none" style={{ color: '#7DE2FC' }}>${p.price}M</span>
              </div>
              {out && <div className="text-[8px] font-bold mt-0.5" style={{ color: '#ffd0c6' }}>OUT {exit}</div>}
            </button>
          );
        })}

        {/* Empty-state hint */}
        {team.length === 0 && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,31,68,0.78)', color: '#fff' }}>
              {canEdit ? 'Tap a + to pick your squad' : 'No squad selected'}
            </div>
          </div>
        )}
      </div>

      {/* Manage a drafted player — tapping your court player opens this, not the profile */}
      {manageId && (() => {
        const id = manageId;
        const mp = getPlayer(id);
        return (
          <div
            onClick={() => setManageId(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <div onClick={e => e.stopPropagation()} className="fade-in w-full" style={{ maxWidth: 340, background: '#FFFFFF', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px rgba(10,27,51,0.4)' }}>
              <div className="flex items-center gap-3 px-4 py-4" style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))' }}>
                <PlayerAvatar playerId={id} name={mp.name} size="sm" />
                <div className="min-w-0">
                  <div className="text-white font-extrabold text-base truncate">{mp.name}</div>
                  <div className="text-xs" style={{ color: 'var(--on-navy)' }}>{mp.flag} #{mp.ranking} · ${mp.price}M</div>
                </div>
              </div>
              <div className="p-2">
                <button
                  onClick={() => { removePlayer(id); setManageId(null); setPickerOpen(true); }}
                  className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                  style={{ color: 'var(--ink)' }}
                >🔁 Replace player</button>
                <button
                  onClick={() => { removePlayer(id); setManageId(null); }}
                  className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                  style={{ color: 'var(--ember)' }}
                >✕ Remove from squad</button>
                <button
                  onClick={() => { openPlayer(id); setManageId(null); }}
                  className="w-full text-left px-3 py-3 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                  style={{ color: 'var(--ink-2)' }}
                >👤 View profile</button>
                <button
                  onClick={() => setManageId(null)}
                  className="w-full text-center px-3 py-2.5 mt-1 rounded-xl text-xs font-semibold transition-colors hover:bg-black/5"
                  style={{ color: 'var(--ink-3)' }}
                >Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      <PlayerPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
