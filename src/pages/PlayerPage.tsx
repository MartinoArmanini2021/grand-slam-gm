import { useGameStore } from '../store/gameStore';
import { getPlayer } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';
import PlayerAvatar from '../components/PlayerAvatar';
import SurfaceBar from '../components/SurfaceBar';

const SURFACE_DOT: Record<string, string> = { grass: '#12A150', clay: '#E5472B', hard: '#0e6fc4' };

function resultStyle(r: string): [string, string] {
  if (r === 'W')   return ['rgba(217,154,0,0.16)',  '#D99A00'];
  if (r === 'F')   return ['rgba(10,27,51,0.08)',   '#0a1f44'];
  if (r === 'SF')  return ['rgba(14,111,196,0.12)',  '#0e6fc4'];
  if (r === 'QF')  return ['rgba(18,161,80,0.12)',   '#12A150'];
  if (r === 'R16') return ['rgba(10,27,51,0.05)',    '#5B6B84'];
  if (r === 'DNS') return ['transparent',            '#9AA7BC'];
  return ['rgba(10,27,51,0.04)', '#9AA7BC'];
}

export default function PlayerPage() {
  const { viewPlayer, playerReturnTab, setActiveTab } = useGameStore();
  const p = viewPlayer ? getPlayer(viewPlayer) : null;
  if (!p) return null;

  const tier = getTier(p.ranking);
  const tm = TIER_META[tier];
  const winRate = Math.round(p.ytd.wins / (p.ytd.wins + p.ytd.losses) * 100);
  const first = p.name.split(' ')[0];
  const hand = p.hand === 'R' ? 'right' : 'left';
  const article = /^[aeiou]/i.test(p.style) ? 'an' : 'a';
  const bio = `${first} is ${article} ${p.style.toLowerCase()} from ${p.country}, currently ranked #${p.ranking} on the ATP Tour. ` +
    `Aged ${p.age} and ${hand}-handed, ${p.ytd.titles > 0 ? `with ${p.ytd.titles} title${p.ytd.titles > 1 ? 's' : ''} in 2026.` : 'still chasing a first title in 2026.'}`;

  const backLabel: Record<string, string> = {
    players: 'Stats', draft: 'Market', team: 'My Squad', league: 'League', home: 'Home', tournament: 'Bracket',
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 fade-in">
      <button onClick={() => setActiveTab(playerReturnTab)} className="text-sm font-semibold mb-4" style={{ color: '#0e6fc4' }}>
        ‹ {backLabel[playerReturnTab] ?? 'Back'}
      </button>

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-4 p-6" style={{ background: 'linear-gradient(120deg,#0a1f44,#123163)' }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 50% 90% at 88% 40%, ${tm.color}22 0%, transparent 70%)` }} />
        <div className="relative flex items-center gap-5">
          <PlayerAvatar playerId={p.id} name={p.name} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-3xl">{p.flag}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${tm.color}22`, color: tm.color, border: `1px solid ${tm.color}55` }}>
                {tier}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight">{p.name}</h1>
            <div className="text-sm" style={{ color: '#AFBFDA' }}>
              #{p.ranking} ATP{p.seed ? ` · Seed ${p.seed}` : ''} · {p.style}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-num text-3xl font-extrabold" style={{ color: '#F0C24B' }}>${p.price}M</div>
            <div className="text-[10px]" style={{ color: '#8FA1BE' }}>price</div>
          </div>
        </div>
        <p className="relative text-sm mt-4 leading-relaxed" style={{ color: '#C8D4E8' }}>{bio}</p>
      </div>

      {/* Quick facts */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { label: 'Rank', value: `#${p.ranking}` },
          { label: 'Age', value: p.age },
          { label: 'Hand', value: p.hand === 'R' ? 'Right' : 'Left' },
          { label: 'Win %', value: `${winRate}%` },
          { label: 'Titles', value: p.ytd.titles },
          { label: 'Record', value: `${p.ytd.wins}-${p.ytd.losses}` },
        ].map((f, i) => (
          <div key={i} className="rounded-xl p-3 text-center" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)' }}>
            <div className="font-num text-lg font-bold" style={{ color: '#0a1f44' }}>{f.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: '#5B6B84' }}>{f.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <Panel title="Surface win rate">
          <SurfaceBar hard={p.surface.hard} clay={p.surface.clay} grass={p.surface.grass} highlight="grass" />
        </Panel>
      </div>

      {/* 2026 tournament results */}
      <Panel title="2026 tournament results">
        <div className="flex gap-3 flex-wrap">
          {p.yearResults.map(r => {
            const [bg, color] = resultStyle(r.result);
            return (
              <div key={r.short} className="text-center min-w-[3.5rem]">
                <div className="flex items-center justify-center gap-1 text-[11px] mb-1.5" style={{ color: '#5B6B84' }}>
                  {r.short}
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: SURFACE_DOT[r.surface] }} />
                </div>
                <span className="font-num text-sm font-bold px-2.5 py-1 rounded inline-block" style={{ background: bg, color, border: `1px solid ${color}30` }}>
                  {r.result}
                </span>
                <div className="text-[9px] mt-1" style={{ color: '#9AA7BC' }}>{r.tournament}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-4 pt-3 text-[11px]" style={{ borderTop: '1px solid rgba(10,27,51,0.06)', color: '#9AA7BC' }}>
          <span><span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: SURFACE_DOT.hard }} />Hard</span>
          <span><span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: SURFACE_DOT.clay }} />Clay</span>
          <span><span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: SURFACE_DOT.grass }} />Grass</span>
          <span className="ml-auto">W = Champion · F = Final · SF/QF/R16 = round reached</span>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.08)', boxShadow: '0 1px 2px rgba(10,27,51,0.04)' }}>
      <h3 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#5B6B84' }}>{title}</h3>
      {children}
    </div>
  );
}
