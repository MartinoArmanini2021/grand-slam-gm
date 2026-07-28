import { useState } from 'react';
import { useGameStore, substitutionCandidates } from '../store/gameStore';
import { findPlayer } from '../data/players';
import { getPlayerExit, isPlayerOut, ROUNDS, transfersOpen } from '../data/tournament';
import { lastName } from '../data/format';
import { SURFACE, TOURNAMENT } from '../data/tournamentConfig';
import { useEscapeToClose } from '../hooks';
import PlayerAvatar from './PlayerAvatar';
import PlayerPickerModal from './PlayerPickerModal';

// Eight on-court positions (as % of the whole box). 4 per half in an arc, net down
// the middle — outer players top/bottom, inner pair pushed toward the net.
const SPOTS = [
  { x: 18, y: 24 }, { x: 30, y: 42 }, { x: 30, y: 60 }, { x: 18, y: 78 }, // left half
  { x: 82, y: 24 }, { x: 70, y: 42 }, { x: 70, y: 60 }, { x: 82, y: 78 }, // right half
];

// On-court avatar size scales with the court's height (the court is a size
// container). Capped at 56px on wide screens; floored at 36px so four rows of
// players never overlap on a phone (where the court is shorter).
const AV_SIZE = 'clamp(36px, 13cqh, 56px)';

export default function SquadCourt({ squad, captainId, readOnly, teamName, emblem, onTeamClick, fluid }: {
  squad?: string[];        // when given, renders this squad instead of your own (read-only)
  captainId?: string;
  readOnly?: boolean;
  teamName?: string;       // team identity shown inside the court (top-left)
  emblem?: string;
  onTeamClick?: () => void; // makes the team label a link (e.g. to your team page)
  fluid?: boolean;         // fill the container width instead of the 860px cap
} = {}) {
  const { myTeam, captain, currentRoundIndex, phase, budget, openPlayer, removePlayer, replacePlayer } = useGameStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [subFor, setSubFor] = useState<string | null>(null); // eliminated player being transferred out
  const team = squad ?? myTeam;
  const cap = captainId ?? (squad ? undefined : captain);
  const revealed = ROUNDS.slice(0, currentRoundIndex).map(r => r.id);
  const isOwnTeam = !readOnly && !squad; // your own court (home / your team page)
  const canEdit = isOwnTeam && phase === 'draft';
  useEscapeToClose(() => { setManageId(null); setSubFor(null); }, !!(manageId || subFor));
  const C = SURFACE.court; // stands / apron (outside court) / surface (inside court)

  return (
    <>
      <div className="relative w-full mx-auto rounded-2xl overflow-hidden select-none aspect-[4/3] sm:aspect-[16/9]" style={{ containerType: 'size', maxWidth: fluid ? undefined : 860, boxShadow: '0 10px 34px rgba(10,27,51,0.22)' }}>
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

          {/* Umpire's chair — beside the net, up in the apron (outside court) */}
          <g stroke={C.line} strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M312 72 L318 50 M328 72 L322 50" />                    {/* splayed legs */}
            <line x1="314" y1="63" x2="326" y2="63" />                      {/* footrest */}
            <rect x="309" y="44" width="22" height="6" rx="1.5" fill={C.apron} />  {/* seat */}
            <line x1="311" y1="44" x2="311" y2="35" />                      {/* backrest */}
            <line x1="331" y1="47" x2="335" y2="47" />                      {/* umpire's desk */}
          </g>
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
                  width: AV_SIZE, height: AV_SIZE,
                  background: 'rgba(12,26,46,0.42)',
                  border: canEdit ? '2px dashed rgba(255,255,255,0.5)' : '2px solid rgba(255,255,255,0.18)',
                }}>
                  {canEdit && <span className="text-white/80 text-2xl leading-none font-light">+</span>}
                </div>
                {canEdit && <span className="mt-1 text-[9px] font-semibold text-white/70">Add</span>}
              </button>
            );
          }
          const p = findPlayer(id);
          if (!p) return null; // stale id (e.g. roster change) → skip rather than crash
          const out = isPlayerOut(id, revealed);
          const exit = getPlayerExit(id);
          const isCap = cap === id;
          return (
            <button
              key={i}
              onClick={() => (isOwnTeam ? setManageId(id) : openPlayer(id))}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${spot.x}%`, top: `${spot.y}%`, opacity: out ? 0.5 : 1 }}
            >
              <div className="relative" style={isCap ? { filter: 'drop-shadow(0 0 6px rgba(217,154,0,0.7))' } : undefined}>
                <PlayerAvatar playerId={id} name={p.name} size="lg" dimension={AV_SIZE} />
                {isCap && (
                  <span className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-[10px] font-extrabold" style={{ width: 20, height: 20, background: 'var(--gold)', color: '#fff', border: '2px solid #fff' }}>C</span>
                )}
              </div>
              <div className="mt-1 px-1.5 py-0.5 rounded-md flex items-center gap-1 whitespace-nowrap" style={{ background: 'rgba(10,31,68,0.82)' }}>
                <span className="text-[10px] font-bold text-white leading-none">{lastName(p.name)}</span>
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
