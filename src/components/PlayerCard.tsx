import clsx from 'clsx';
import type { Player } from '../types';
import SurfaceBar from './SurfaceBar';
import FormDots from './FormDots';

interface Props {
  player: Player;
  mode: 'draft' | 'detail' | 'squad';
  selected?: boolean;
  isCaptain?: boolean;
  isEliminated?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
  onSetCaptain?: () => void;
  onClick?: () => void;
  disabled?: boolean;
}

const TIER_COLORS: Record<number, string> = {
  1: 'from-yellow-500 to-amber-600',
  2: 'from-slate-400 to-slate-500',
  3: 'from-orange-600 to-orange-700',
  4: 'from-blue-600 to-blue-700',
};

function getTier(ranking: number) {
  if (ranking <= 4) return 1;
  if (ranking <= 8) return 2;
  if (ranking <= 16) return 3;
  return 4;
}

export default function PlayerCard({
  player, mode, selected, isCaptain, isEliminated, onAdd, onRemove, onSetCaptain, onClick, disabled,
}: Props) {
  const tier = getTier(player.ranking);
  const tierGradient = TIER_COLORS[tier];

  if (mode === 'squad') {
    return (
      <div className={clsx(
        'flex items-center gap-3 p-3 rounded-xl border transition-all',
        isEliminated
          ? 'border-slate-700 bg-slate-800/30 opacity-60'
          : isCaptain
          ? 'border-yellow-500/50 bg-yellow-500/5'
          : 'border-slate-700 bg-slate-800/50',
      )}>
        {/* Avatar */}
        <div className={clsx(
          'w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shrink-0',
          tierGradient
        )}>
          {player.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{player.name}</span>
            {isCaptain && <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded font-bold">C</span>}
            {isEliminated && <span className="text-xs text-red-400">OUT</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-slate-400 text-xs">{player.flag} #{player.ranking}</span>
            <span className="text-green-400 text-xs">🌱 {player.surface.grass}%</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!isEliminated && onSetCaptain && !isCaptain && (
            <button
              onClick={onSetCaptain}
              className="text-xs px-2 py-1 rounded-lg bg-slate-700 hover:bg-yellow-500/20 hover:text-yellow-400 text-slate-300 transition-colors border border-slate-600"
            >
              ⭐
            </button>
          )}
          {onRemove && !isEliminated && (
            <button
              onClick={onRemove}
              className="text-xs px-2 py-1 rounded-lg bg-slate-700 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors border border-slate-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative rounded-2xl border p-4 transition-all cursor-pointer group',
        selected
          ? 'border-green-500/60 bg-green-500/5 shadow-lg shadow-green-500/10'
          : disabled
          ? 'border-slate-700/50 bg-slate-800/20 opacity-50 cursor-not-allowed'
          : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60',
      )}
    >
      {/* Seed badge */}
      {player.seed && (
        <div className="absolute top-2 right-2 text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono">
          [{player.seed}]
        </div>
      )}

      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className={clsx(
          'w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0',
          tierGradient
        )}>
          {player.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <div className="font-semibold text-slate-100 leading-tight">{player.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {player.flag} {player.country} · #{player.ranking}
          </div>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-bold text-green-400">${player.price}M</span>
        <FormDots form={player.form} size="sm" />
      </div>

      {/* Surface bars */}
      <SurfaceBar hard={player.surface.hard} clay={player.surface.clay} grass={player.surface.grass} highlight="grass" compact />

      {/* YTD */}
      <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
        <span>{player.ytd.wins}W – {player.ytd.losses}L</span>
        {player.ytd.titles > 0 && (
          <span className="text-yellow-400">🏆 ×{player.ytd.titles}</span>
        )}
        <span>{player.style}</span>
      </div>

      {/* Action buttons */}
      {mode === 'draft' && (
        <div className="mt-3 flex gap-2">
          {selected ? (
            <button
              onClick={e => { e.stopPropagation(); onRemove?.(); }}
              className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
            >
              Remove
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onAdd?.(); }}
              disabled={disabled}
              className={clsx(
                'flex-1 py-2 rounded-xl text-sm font-semibold transition-colors border',
                disabled
                  ? 'bg-slate-700/30 border-slate-700 text-slate-600 cursor-not-allowed'
                  : 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
              )}
            >
              + Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}
