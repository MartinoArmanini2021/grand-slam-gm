interface Props {
  hard: number;
  clay: number;
  grass: number;
  highlight?: 'hard' | 'clay' | 'grass';
  compact?: boolean;
}

const SURFACES = [
  { key: 'grass', label: 'G', active: '#12A150', dim: '#9AA7BC', bar: '#12A150' },
  { key: 'hard',  label: 'H', active: '#0e6fc4', dim: '#9AA7BC', bar: '#0e6fc4' },
  { key: 'clay',  label: 'C', active: '#E5472B', dim: '#9AA7BC', bar: '#E5472B' },
];

export default function SurfaceBar({ hard, clay, grass, highlight = 'grass', compact }: Props) {
  const vals: Record<string, number> = { grass, hard, clay };

  if (compact) {
    return (
      <div className="flex gap-3">
        {SURFACES.map(s => {
          const isHL = s.key === highlight;
          return (
            <div key={s.key} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-bold" style={{ color: isHL ? s.active : s.dim }}>{s.label}</span>
              <span className="font-num text-xs font-semibold" style={{ color: isHL ? s.active : '#5B6B84' }}>{vals[s.key]}%</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {SURFACES.map(s => {
        const isHL = s.key === highlight;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="text-[11px] w-4 font-bold" style={{ color: isHL ? s.active : '#5B6B84' }}>{s.label}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(10,27,51,0.06)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${vals[s.key]}%`, background: s.bar, opacity: isHL ? 1 : 0.3 }}
              />
            </div>
            <span className="font-num text-xs w-7 text-right" style={{ color: isHL ? s.active : '#5B6B84' }}>{vals[s.key]}%</span>
          </div>
        );
      })}
    </div>
  );
}
