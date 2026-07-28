import { useState } from 'react';
import { useGameStore, substitutionCandidates } from '../store/gameStore';
import { findPlayer } from '../data/players';
import { getPlayerExit, isPlayerOut, ROUNDS, transfersOpen } from '../data/tournament';
import { lastName } from '../data/format';
import { SURFACE, TOURNAMENT } from '../data/tournamentConfig';
import { SQUAD_SIZE } from '../data/squadRules';
import { useEscapeToClose } from '../hooks';
import PlayerAvatar from './PlayerAvatar';
import PlayerPickerModal from './PlayerPickerModal';

// The two captains stand ON the court (mid-height, one each side of the net);
// their avatars scale with the court height (the court is a size container).
const LEADER_SIZE = 'clamp(50px, 20cqh, 78px)';

export default function SquadCourt({ squad, captainId, viceCaptainId, readOnly, teamName, emblem, onTeamClick, fluid }: {
  squad?: string[];        // when given, renders this squad instead of your own (read-only)
  captainId?: string;
  viceCaptainId?: string;
  readOnly?: boolean;
  teamName?: string;       // team identity shown inside the court (top-left)
  emblem?: string;
  onTeamClick?: () => void; // makes the team label a link (e.g. to your team page)
  fluid?: boolean;         // fill the container width instead of the 860px cap
} = {}) {
  const { myTeam, captain, viceCaptain, currentRoundIndex, phase, budget, openPlayer, removePlayer, replacePlayer, setCaptain, setViceCaptain } = useGameStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<string | null>(null); // eliminated player being transferred out
  const team = squad ?? myTeam;
  const cap = captainId ?? (squad ? undefined : captain ?? undefined);
  const vice = viceCaptainId ?? (squad ? undefined : viceCaptain ?? undefined);
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
  const isOwnTeam = !readOnly && !squad; // your own court (home / your team page)
  const canEdit = isOwnTeam && phase === 'draft';
  const canCaptain = isOwnTeam && (phase === 'draft' || phase === 'pre_round'); // captaincy is editable
  useEscapeToClose(() => { setManageId(null); setSubFor(null); }, !!(manageId || subFor));
  const C = SURFACE.court; // stands / apron (outside court) / surface (inside court)

  // Everything is ordered by tier: Platinum → Gold → Silver (i.e. best rank first).
  const byRank = (ids: string[]) => [...ids].sort((a, b) => (findPlayer(a)?.ranking ?? 9999) - (findPlayer(b)?.ranking ?? 9999));
  // Two leaders stand ON the court (at the baselines); everyone else fills the bench.
  const bench = byRank(team.filter(id => id !== cap && id !== vice));
  const benchTop = bench[0]; // best-ranked bench player — promoted when a leader steps down
  const LEADERS: { id: string | undefined; role: 'C' | 'V'; x: number }[] = [
    { id: cap, role: 'C', x: 20 },  // captain — left baseline
    { id: vice, role: 'V', x: 80 }, // vice — right baseline
  ];
  const emptyBench = Math.max(0, SQUAD_SIZE - team.length); // add-slots shown during the draft

  return (
    <>
      <div className="w-full mx-auto" style={{ maxWidth: fluid ? undefined : 860 }}>
      <div className="relative w-full rounded-2xl overflow-hidden select-none aspect-[4/3] sm:aspect-[16/9]" style={{ containerType: 'size', boxShadow: '0 10px 34px rgba(10,27,51,0.22)' }}>
        {/* Stadium + court (horizontal). Colours come from the active tournament's
            surface theme, so the court re-skins per tournament (grass/hard/clay). */}
        <svg viewBox="0 0 640 360" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="stand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.standTop} />
              <stop offset="1" stopColor={C.standBottom} />
            </linearGradient>
            {/* soft vignette so the inside court reads as recessed / lit */}
            <radialGradient id="court-lite" cx="0.5" cy="0.5" r="0.75">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
            </radialGradient>
          </defs>

          {/* ── ZONE 1 · STANDS (stadium seating) ── */}
          <rect x="0" y="0" width="640" height="360" fill="url(#stand)" />
          {/* concentric seating tiers — subtle steps down toward the court */}
          <rect x="10" y="9" width="620" height="342" rx="18" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="10" />
          <rect x="24" y="21" width="592" height="318" rx="15" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="8" />
          {/* crowd speckle across the whole seating ring (outside the apron) */}
          {Array.from({ length: 220 }).map((_, i) => {
            const edge = i % 4;
            const t = ((i * 12.7) % 100) / 100;
            const row = i % 4;
            let cx = 0, cy = 0;
            if (edge === 0) { cx = 18 + t * 604; cy = 6 + row * 7.5; }         // top
            else if (edge === 1) { cx = 18 + t * 604; cy = 328 + row * 7; }    // bottom
            else if (edge === 2) { cx = 5 + row * 8; cy = 20 + t * 320; }      // left
            else { cx = 603 + row * 8; cy = 20 + t * 320; }                    // right
            return <circle key={i} cx={cx} cy={cy} r="1.7" fill={i % 2 ? C.crowdLight : C.crowdDark} opacity="0.55" />;
          })}

          {/* ── ZONE 2 · OUTSIDE COURT (painted run-off apron) ── */}
          <rect x="34" y="30" width="572" height="300" rx="12" fill={C.apron} />
          <rect x="34" y="30" width="572" height="300" rx="12" fill="none" stroke="#000000" strokeOpacity="0.22" strokeWidth="2.5" />

          {/* ── ZONE 3 · INSIDE COURT (playing surface + lines) ── */}
          <g>
            <rect x="96" y="78" width="448" height="204" fill={C.surface} />
            {/* grass mowing stripes — grass only */}
            {C.stripe && Array.from({ length: 8 }).map((_, i) => (
              i % 2 === 0 ? <rect key={i} x={96 + i * 56} y="78" width="56" height="204" fill={C.stripe} /> : null
            ))}
            <rect x="96" y="78" width="448" height="204" fill="url(#court-lite)" />
            {/* painted court lines */}
            <g stroke={C.line} strokeOpacity="0.96" strokeWidth="2.4" fill="none">
              <rect x="96" y="78" width="448" height="204" />       {/* doubles box */}
              <line x1="96" y1="104" x2="544" y2="104" />           {/* top singles sideline */}
              <line x1="96" y1="256" x2="544" y2="256" />           {/* bottom singles sideline */}
              <line x1="200" y1="104" x2="200" y2="256" />          {/* left service line */}
              <line x1="440" y1="104" x2="440" y2="256" />          {/* right service line */}
              <line x1="200" y1="180" x2="440" y2="180" />          {/* centre service line */}
              <line x1="96" y1="180" x2="104" y2="180" />           {/* baseline centre mark */}
              <line x1="536" y1="180" x2="544" y2="180" />
            </g>
            {/* net (vertical, centre) + posts */}
            <line x1="320" y1="74" x2="320" y2="286" stroke={C.net} strokeWidth="4.5" strokeOpacity="0.97" />
            <line x1="320" y1="74" x2="320" y2="286" stroke={C.netShadow} strokeWidth="1.5" strokeOpacity="0.25" strokeDasharray="3 3" />
            <circle cx="320" cy="74" r="3.2" fill={C.net} />
            <circle cx="320" cy="286" r="3.2" fill={C.net} />
          </g>

          {/* Umpire's chair — clean filled silhouette in the apron above the net */}
          <g fill="#0b2036" fillOpacity="0.92">
            <rect x="305" y="30" width="30" height="3.6" rx="1.8" />        {/* sun canopy */}
            <rect x="318.4" y="33" width="3.2" height="8" />                {/* mast */}
            <rect x="311" y="40" width="4" height="13" rx="1" />           {/* backrest */}
            <rect x="311" y="49" width="18" height="3.6" rx="1" />         {/* seat */}
            <rect x="313" y="62.5" width="14" height="2.6" rx="1.2" />     {/* footrest */}
          </g>
          <path d="M313 53 L316 73 M327 53 L323 73" stroke="#0b2036" strokeOpacity="0.92" strokeWidth="2.6" strokeLinecap="round" /> {/* A-frame legs */}
          <path d="M311 40 h4 M311 49 h18" stroke="#eef4f0" strokeOpacity="0.22" strokeWidth="0.9" /> {/* crisp edge highlight */}
        </svg>

        {/* Team identity — logo + name, top-left (links to your team page) */}
        {teamName && (
          <button
            onClick={onTeamClick}
            disabled={!onTeamClick}
            className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90"
            style={{ cursor: onTeamClick ? 'pointer' : 'default' }}
            title={onTeamClick ? 'Open your team' : undefined}
          >
            <span className="flex items-center justify-center rounded-lg sm:rounded-xl text-base sm:text-xl shrink-0 w-8 h-8 sm:w-10 sm:h-10" style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)' }}>{emblem}</span>
            <span className="text-sm sm:text-lg font-extrabold text-white" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.5)' }}>{teamName}</span>
            {onTeamClick && <span className="text-white text-base sm:text-lg leading-none" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>›</span>}
          </button>
        )}

        {/* The two captains — on the court, one each side of the net */}
        {LEADERS.map(({ id, role, x }) => {
          const isC = role === 'C';
          const badgeColor = isC ? 'var(--gold)' : '#7DA9D8';
          const label = isC ? 'Captain' : 'Vice';
          if (!id) {
            return (
              <button
                key={role}
                onClick={() => canEdit && setPickerOpen(true)}
                disabled={!canEdit}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: `${x}%`, top: '50%', cursor: canEdit ? 'pointer' : 'default' }}
              >
                <div className="rounded-full flex items-center justify-center" style={{ width: LEADER_SIZE, height: LEADER_SIZE, background: 'rgba(12,26,46,0.38)', border: `2px dashed ${badgeColor}` }}>
                  <span style={{ color: badgeColor, fontWeight: 800, fontSize: 'clamp(11px,4cqh,15px)' }}>{role}</span>
                </div>
                <span className="mt-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: '#fff', opacity: 0.85 }}>{label}</span>
              </button>
            );
          }
          const p = findPlayer(id);
          if (!p) return null;
          const out = isPlayerOut(id, revealed);
          const exit = getPlayerExit(id);
          return (
            <button
              key={role}
              onClick={() => (isOwnTeam ? setManageId(id) : openPlayer(id))}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${x}%`, top: '50%', opacity: out ? 0.5 : 1 }}
            >
              <div className="relative" style={{ filter: `drop-shadow(0 0 7px ${isC ? 'rgba(217,154,0,0.75)' : 'rgba(125,169,216,0.75)'})` }}>
                <PlayerAvatar playerId={id} name={p.name} size="lg" dimension={LEADER_SIZE} />
                <span className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-[10px] font-extrabold" style={{ width: 20, height: 20, background: badgeColor, color: '#fff', border: '2px solid #fff' }}>{role}</span>
              </div>
              <div className="mt-1 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap" style={{ background: 'rgba(10,31,68,0.82)' }}>
                <span className="text-[11px] font-bold text-white leading-none">{lastName(p.name)}</span>
                <span className="font-num text-[9px] leading-none" style={{ color: '#7DE2FC' }}>${p.price}M</span>
              </div>
              <span className="text-[8px] font-bold uppercase tracking-wide mt-0.5" style={{ color: badgeColor }}>{isC ? 'Captain ×2' : 'Vice ×1.5'}</span>
              {out && <div className="text-[8px] font-bold mt-0.5" style={{ color: '#ffd0c6' }}>OUT {exit}</div>}
            </button>
          );
        })}

        {/* Empty-state hint */}
        {team.length === 0 && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(10,31,68,0.78)', color: '#fff' }}>
              {canEdit ? 'Draft your squad in the Market' : 'No squad selected'}
            </div>
          </div>
        )}
      </div>

      {/* ── Bench: the eight supporting players below the court ── */}
      {(bench.length > 0 || emptyBench > 0) && (
        <div className="mt-2.5">
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--ink-3)' }}>Bench</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(10,27,51,0.08)' }} />
          </div>
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-2.5">
            {bench.map(id => {
              const p = findPlayer(id);
              if (!p) return null;
              const out = isPlayerOut(id, revealed);
              const exit = getPlayerExit(id);
              return (
                <button
                  key={id}
                  onClick={() => (isOwnTeam ? setManageId(id) : openPlayer(id))}
                  className="flex flex-col items-center gap-0.5 w-[15%] min-w-[52px] max-w-[72px]"
                  style={{ opacity: out ? 0.5 : 1 }}
                >
                  <PlayerAvatar playerId={id} name={p.name} size="md" />
                  <span className="text-[10px] font-bold leading-none truncate w-full text-center" style={{ color: 'var(--ink)' }}>{lastName(p.name)}</span>
                  <span className="font-num text-[9px] leading-none" style={{ color: out ? 'var(--ember)' : 'var(--blue)' }}>{out ? `OUT ${exit}` : `$${p.price}M`}</span>
                </button>
              );
            })}
            {canEdit && Array.from({ length: emptyBench }).map((_, i) => (
              <button
                key={`e${i}`}
                onClick={() => setPickerOpen(true)}
                className="flex flex-col items-center gap-0.5 w-[15%] min-w-[52px] max-w-[72px]"
              >
                <span className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, border: '2px dashed rgba(10,27,51,0.22)' }}>
                  <span className="text-xl leading-none font-light" style={{ color: 'var(--ink-3)' }}>+</span>
                </span>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>Add</span>
              </button>
            ))}
          </div>
        </div>
      )}
      </div>{/* /wrapper */}

      {/* Manage a drafted player — tapping your court player opens this, not the profile */}
      {manageId && (() => {
        const id = manageId;
        const mp = findPlayer(id);
        if (!mp) return null;
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
                {canCaptain && !isPlayerOut(id, revealed) && (
                  <>
                    {captain !== id && (
                      <button
                        onClick={() => { setCaptain(id); setManageId(null); }}
                        className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                        style={{ color: 'var(--ink)' }}
                      >👑 Make Captain <span className="font-num text-xs" style={{ color: 'var(--gold)' }}>×2</span></button>
                    )}
                    {viceCaptain !== id && (
                      <button
                        onClick={() => { setViceCaptain(id); setManageId(null); }}
                        className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                        style={{ color: 'var(--ink)' }}
                      >🥈 Make Vice-Captain <span className="font-num text-xs" style={{ color: '#5a7ba5' }}>×1.5</span></button>
                    )}
                    {(captain === id || viceCaptain === id) && benchTop && (
                      <button
                        onClick={() => { if (captain === id) setCaptain(benchTop); else setViceCaptain(benchTop); setManageId(null); }}
                        className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                        style={{ color: 'var(--ink-2)' }}
                      >⬇️ Move to bench</button>
                    )}
                    <div className="my-1 h-px" style={{ background: 'rgba(10,27,51,0.08)' }} />
                  </>
                )}
                {phase === 'draft' ? (
                  <>
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
                  </>
                ) : (() => {
                  const out = isPlayerOut(id, revealed);
                  const windowOpen = transfersOpen(currentRoundIndex);
                  const hasSubs = out && windowOpen && substitutionCandidates(myTeam, budget, currentRoundIndex).length > 0;
                  if (hasSubs) return (
                    <button
                      onClick={() => { setManageId(null); setSubFor(id); }}
                      className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-colors hover:bg-black/5"
                      style={{ color: 'var(--ember)' }}
                    >🔁 Transfer out — replace {lastName(mp.name)}</button>
                  );
                  return (
                    <div className="px-3 py-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                      {!out ? 'Still in the draw — locked into your squad.'
                        : !windowOpen ? 'Eliminated — the transfer window has closed.'
                        : 'Eliminated — no affordable, still-alive replacement available.'}
                    </div>
                  );
                })()}
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

      {/* Transfer-out picker: choose a still-alive, affordable replacement */}
      {subFor && (() => {
        const outP = findPlayer(subFor);
        if (!outP) return null;
        const candidates = substitutionCandidates(myTeam, budget, currentRoundIndex);
        return (
          <div
            onClick={() => setSubFor(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(10,27,51,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <div onClick={e => e.stopPropagation()} className="fade-in w-full" style={{ maxWidth: 520, background: '#FFFFFF', borderRadius: '18px 18px 0 0', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: 'linear-gradient(120deg,var(--ink),var(--navy-2))', padding: '16px 18px', borderRadius: '18px 18px 0 0' }}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-white font-extrabold text-base">Replace {lastName(outP.name)}</div>
                    <div className="text-xs" style={{ color: 'var(--on-navy)' }}>
                      <span className="font-num">${budget.toFixed(1)}M</span> to spend · still-alive players only
                    </div>
                  </div>
                  <button onClick={() => setSubFor(null)} className="text-white text-sm font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>Cancel</button>
                </div>
              </div>
              <div className="overflow-y-auto p-2" style={{ flex: 1 }}>
                {candidates.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: 'var(--ink-3)' }}>No affordable, still-alive replacements.</div>
                ) : candidates.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl">
                    <PlayerAvatar playerId={p.id} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>#{p.ranking} · 🎾{p.surface[TOURNAMENT.surface]}% {SURFACE.label}</div>
                    </div>
                    <div className="font-num text-sm font-bold shrink-0 w-12 text-right" style={{ color: 'var(--blue)' }}>${p.price}M</div>
                    <button
                      onClick={() => { replacePlayer(subFor, p.id); setSubFor(null); }}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                      style={{ background: 'var(--green)' }}
                    >Sign</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <PlayerPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
