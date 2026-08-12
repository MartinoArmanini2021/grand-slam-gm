import { useEffect, useState } from 'react';
import { useLiveStore } from '../store/liveStore';
import { TOURNAMENT } from '../data/tournamentConfig';
import { ROUNDS } from '../data/tournament';
import { roundComplete, matchKey, type LiveMatch } from '../data/liveResults';
import { PLAYERS, findPlayer } from '../data/players';
import { useLiveFeed } from '../data/useLiveFeed';
import { toast } from '../store/toastStore';
import { fetchIsAdmin, pushMatchOverride, pushClearMatchOverride, fetchIngestHealth, type IngestHealth } from '../data/cloud';

// ── Match Admin ──────────────────────────────────────────────────────────────
// The operator's console for a LIVE tournament: enter or correct each match's
// winner and watch rounds fill in. Any result set here is an OVERRIDE the automated
// feed can never overwrite (liveStore). In replay mode there's nothing to run — the
// draw is complete and baked — so the page says so.

const nameOf = (id: string) => findPlayer(id)?.name ?? id;

// A small synthetic draw (top-8 roster players across QF→F) so the console can be
// exercised before the real field + feed land. Clearly labelled as test data.
function sampleDraw(): LiveMatch[] {
  const p = [...PLAYERS].sort((a, b) => a.ranking - b.ranking).slice(0, 8).map(x => x.id);
  return [
    { round: 'QF', slot: 0, half: 'top',    p1Id: p[0], p2Id: p[1] },
    { round: 'QF', slot: 1, half: 'top',    p1Id: p[2], p2Id: p[3] },
    { round: 'QF', slot: 2, half: 'bottom', p1Id: p[4], p2Id: p[5] },
    { round: 'QF', slot: 3, half: 'bottom', p1Id: p[6], p2Id: p[7] },
    { round: 'SF', slot: 0, half: 'top',    p1Id: p[0], p2Id: p[2] },
    { round: 'SF', slot: 1, half: 'bottom', p1Id: p[4], p2Id: p[6] },
    { round: 'F',  slot: 0, half: 'top',    p1Id: p[0], p2Id: p[4] },
  ];
}

// The SERVER ingest's health (public.ingest_health), surfaced so a silent break is visible.
// Two failure modes matter, and neither used to show anywhere in the app:
//   • the ingest stopped / errored → public.matches freezes → every score stops moving
//   • draftedMissing → a drafted player the parser could not match to the published draw
//     (a Wikipedia name change is enough), so that player scores ZERO for everyone
function ServerHealth({ health, serverAdmin }: { health: IngestHealth | null; serverAdmin: boolean }) {
  if (!health) return null;
  const stale = health.lastRunAt ? Date.now() - Date.parse(health.lastRunAt) > 20 * 60_000 : true;
  const bad = health.ok === false || stale;
  const missing = health.draftedMissing ?? [];
  return (
    <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.08)' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm min-w-0">
          <div className="font-bold" style={{ color: 'var(--ink)' }}>Server ingest (feeds the leaderboard)</div>
          <div className="text-xs mt-0.5" style={{ color: bad ? 'var(--ember)' : 'var(--ink-3)' }}>
            {health.ok === false ? 'Last run FAILED' : stale ? 'Stale — no successful run recently' : 'Healthy'}
            {health.lastRunAt && ` · ran ${relTime(Date.parse(health.lastRunAt))}`}
            {health.matchesWritten != null && ` · ${health.matchesWritten} matches written`}
          </div>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={serverAdmin
            ? { background: 'rgba(18,161,80,0.14)', color: 'var(--green)' }
            : { background: 'rgba(217,154,0,0.14)', color: 'var(--gold)' }}
          title={serverAdmin
            ? 'Your corrections are saved server-side, for every manager'
            : 'You are not a server admin — corrections stay on this device only'}
        >
          {serverAdmin ? 'admin · corrections shared' : 'local only'}
        </span>
      </div>

      {health.error && (
        <div className="text-xs rounded-lg px-2.5 py-1.5 mt-2" style={{ background: 'rgba(229,71,43,0.08)', color: '#c0341c', border: '1px solid rgba(229,71,43,0.2)' }}>
          {health.error}
        </div>
      )}

      {missing.length > 0 && (
        <div className="text-xs rounded-lg px-2.5 py-2 mt-2" style={{ background: 'rgba(217,154,0,0.08)', color: 'var(--ink-2)', border: '1px solid rgba(217,154,0,0.28)' }}>
          <b style={{ color: 'var(--ink)' }}>{missing.length} drafted player{missing.length === 1 ? '' : 's'} not found in the server's draw</b>
          {' '}— they score <b>0</b> on the leaderboard until the name matches. Check their spelling against the draw page:
          <div className="mt-1 font-num" style={{ color: 'var(--ink)' }}>{missing.map(nameOf).join(' · ')}</div>
        </div>
      )}

      {!serverAdmin && (
        <div className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
          Corrections below will be saved on this device only. To correct results for everyone, apply
          <code className="mx-1">supabase/admin_match_overrides.sql</code>and add your account to
          <code className="mx-1">public.app_admins</code>.
        </div>
      )}
    </div>
  );
}

function relTime(ms: number | null): string {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function AdminPage() {
  const { draw, results, overrides, lastSync, setDraw, recordResult, clearResult, resetLive } = useLiveStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);
  const { sync, busy, error } = useLiveFeed(autoPoll);
  // Server-side admin rights (public.app_admins). Only a real admin can push a correction
  // into public.matches — which is what the leaderboard is actually scored from.
  const [serverAdmin, setServerAdmin] = useState(false);
  const [health, setHealth] = useState<IngestHealth | null>(null);

  useEffect(() => { void fetchIsAdmin().then(setServerAdmin); }, []);
  useEffect(() => {
    const load = () => void fetchIngestHealth(TOURNAMENT.id).then(setHealth);
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // Record a correction LOCALLY (instant feedback for the operator) and push it to the
  // server so every other manager's score is corrected too. Local-only would fix this one
  // browser and leave the leaderboard wrong — the bug this closes.
  const applyResult = (round: string, slot: number, winnerId: string) => {
    recordResult(round as Parameters<typeof recordResult>[0], slot, winnerId);
    if (!serverAdmin) return; // not a server admin → local-only, with the banner explaining why
    void pushMatchOverride(round, slot, winnerId)
      .then(() => toast('Correction saved for everyone', 'good'))
      .catch((e: Error) => toast(`Saved locally only — server refused: ${e.message}`, 'warn'));
  };

  const applyClear = (round: string, slot: number) => {
    clearResult(round as Parameters<typeof clearResult>[0], slot);
    if (!serverAdmin) return;
    void pushClearMatchOverride(round, slot)
      .then(() => toast('Correction cleared — the feed decides again', 'good'))
      .catch((e: Error) => toast(`Cleared locally only — server refused: ${e.message}`, 'warn'));
  };

  const isLive = TOURNAMENT.mode === 'live';
  // Only the rounds this tournament actually has, in order, that have pairings yet.
  const rounds = ROUNDS.filter(r => draw.some(m => m.round === r.id));
  const recorded = Object.keys(results).length;

  return (
    <div className="max-w-4xl mx-auto px-3 pt-4 pb-10 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Match Admin</h1>
          <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {TOURNAMENT.edition} · {TOURNAMENT.location}
          </div>
        </div>
        <span
          className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
          style={isLive
            ? { background: 'rgba(18,161,80,0.14)', color: 'var(--green)' }
            : { background: 'rgba(10,27,51,0.06)', color: 'var(--ink-3)' }}
        >
          {isLive ? '● Live' : 'Replay'}
        </span>
      </div>

      {!isLive ? (
        <div className="rounded-2xl px-5 py-8 text-center text-sm" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.08)', color: 'var(--ink-2)' }}>
          <div className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Nothing to manage</div>
          {TOURNAMENT.edition} is a completed draw played back with no spoilers, so there
          are no live results to enter. This console runs when the active tournament is live.
        </div>
      ) : (
        <>
          {/* Feed status + controls */}
          <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.08)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <div className="font-bold" style={{ color: 'var(--ink)' }}>Automated feed</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  Last synced {relTime(lastSync)} · your edits below always override the feed
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                  <input type="checkbox" checked={autoPoll} onChange={e => setAutoPoll(e.target.checked)} className="w-4 h-4" />
                  Auto
                </label>
                <button
                  onClick={() => void sync()}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'var(--blue)' }}
                >
                  {busy ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            </div>
            {error && (
              <div className="text-xs rounded-lg px-2.5 py-1.5 mt-2" style={{ background: 'rgba(229,71,43,0.08)', color: '#c0341c', border: '1px solid rgba(229,71,43,0.2)' }}>
                {error} — the draw page may not be published yet; enter results manually below.
              </div>
            )}
          </div>

          {/* Server ingest health — the pipeline that ACTUALLY feeds the leaderboard. The
              browser feed above is only this operator's preview; if the server ingest is
              stale or can't name-match a drafted player, those managers silently score 0. */}
          <ServerHealth health={health} serverAdmin={serverAdmin} />

          {draw.length === 0 ? (
            <div className="rounded-2xl px-5 py-8 text-center" style={{ background: '#fff', border: '1px solid rgba(10,27,51,0.08)' }}>
              <div className="font-bold mb-1" style={{ color: 'var(--ink)' }}>No draw loaded yet</div>
              <div className="text-sm mb-4" style={{ color: 'var(--ink-2)' }}>
                The draw arrives from the feed once it's published (~Aug 1), or you can load a
                sample bracket to try the console now.
              </div>
              <button
                onClick={() => setDraw(sampleDraw())}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: 'var(--blue)' }}
              >
                Load sample draw (test)
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                  {recorded} of {draw.length} results recorded
                </div>
                <button onClick={() => setDraw([])} className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>
                  Clear draw
                </button>
              </div>

              {rounds.map(round => {
                const matches = draw.filter(m => m.round === round.id).sort((a, b) => a.slot - b.slot);
                const done = roundComplete(draw, results, round.id);
                return (
                  <div key={round.id} className="mb-4">
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                      <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{round.label}</h2>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={done
                          ? { background: 'rgba(18,161,80,0.14)', color: 'var(--green)' }
                          : { background: 'rgba(10,27,51,0.06)', color: 'var(--ink-3)' }}
                      >
                        {done ? 'Complete' : `${matches.filter(m => results[matchKey(m.round, m.slot)]).length}/${matches.length}`}
                      </span>
                    </div>
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(10,27,51,0.08)' }}>
                      {matches.map((m, i) => {
                        const key = matchKey(m.round, m.slot);
                        const winner = results[key];
                        const isOverride = !!overrides[key];
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-2 px-2 py-2 bg-white"
                            style={{ borderTop: i > 0 ? '1px solid rgba(10,27,51,0.06)' : undefined }}
                          >
                            <div className="flex-1 grid grid-cols-2 gap-1.5">
                              {[m.p1Id, m.p2Id].map(pid => {
                                const isWin = winner === pid;
                                return (
                                  <button
                                    key={pid}
                                    onClick={() => applyResult(m.round, m.slot, pid)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-left transition-colors"
                                    style={{
                                      background: isWin ? 'rgba(18,161,80,0.12)' : 'rgba(10,27,51,0.03)',
                                      border: `1px solid ${isWin ? 'rgba(18,161,80,0.4)' : 'rgba(10,27,51,0.08)'}`,
                                    }}
                                  >
                                    <span className="text-[13px] truncate flex-1" style={{ color: 'var(--ink)', fontWeight: isWin ? 800 : 500 }}>
                                      {nameOf(pid)}
                                    </span>
                                    {isWin && <span className="text-[11px] shrink-0" style={{ color: 'var(--green)' }}>✓ won</span>}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 w-16 justify-end">
                              {isOverride && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(217,154,0,0.14)', color: 'var(--gold)' }} title="Manually set — the feed won't overwrite this">
                                  edit
                                </span>
                              )}
                              {winner && (
                                <button
                                  onClick={() => applyClear(m.round, m.slot)}
                                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
                                  style={{ background: 'rgba(10,27,51,0.05)', color: 'var(--ink-3)' }}
                                  title="Clear this result"
                                  aria-label={`Clear ${round.label} result`}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Danger zone */}
              <div className="mt-6 rounded-2xl px-4 py-3" style={{ background: 'rgba(229,71,43,0.05)', border: '1px solid rgba(229,71,43,0.2)' }}>
                {!confirmReset ? (
                  <button onClick={() => setConfirmReset(true)} className="text-sm font-semibold" style={{ color: 'var(--ember)' }}>
                    Reset all live data
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Clear the draw and every recorded result?</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setConfirmReset(false)} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(10,27,51,0.05)', color: 'var(--ink-2)' }}>Cancel</button>
                      <button onClick={() => { resetLive(); setConfirmReset(false); }} className="text-sm font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--ember)' }}>Reset</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
