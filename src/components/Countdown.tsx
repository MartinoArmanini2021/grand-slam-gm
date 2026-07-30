import { useState, useEffect } from 'react';

// Live time-remaining to an ISO datetime. Returns null once it's passed / no target.
export function useCountdown(targetIso?: string): { d: number; h: number; m: number; s: number; total: number } | null {
  const target = targetIso ? Date.parse(targetIso) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!Number.isFinite(target)) return null;
  const total = target - now;
  if (total <= 0) return null;
  const s = Math.floor(total / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total };
}

// "2d 4h 13m" far out; drops to "4h 13m 09s" (with seconds) under an hour for urgency.
function fmt(c: { d: number; h: number; m: number; s: number }): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (c.d > 0) return `${c.d}d ${c.h}h ${c.m}m`;
  if (c.h > 0) return `${c.h}h ${p2(c.m)}m`;
  return `${c.m}m ${p2(c.s)}s`;
}

// A deadline banner with a ticking countdown. Renders nothing once the deadline passes
// (so callers can fall through to their next state). Turns urgent (red) under an hour.
export default function Countdown({ target, title, note }: { target?: string; title: string; note?: string }) {
  const c = useCountdown(target);
  if (!c) return null;
  const urgent = c.total < 60 * 60 * 1000;
  const color = urgent ? 'var(--ember)' : 'var(--blue)';
  const bg = urgent ? 'rgba(229,71,43,0.08)' : 'rgba(14,111,196,0.07)';
  const border = urgent ? 'rgba(229,71,43,0.28)' : 'rgba(14,111,196,0.22)';
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl mt-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <span className="text-lg shrink-0">⏳</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</div>
        {note && <div className="text-[11px]" style={{ color: 'var(--ink-2)' }}>{note}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="font-num text-base font-extrabold tabular-nums" style={{ color }}>{fmt(c)}</div>
        <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>remaining</div>
      </div>
    </div>
  );
}
