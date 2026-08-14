import { useGameStore } from '../store/gameStore';
import { useLiveStore } from '../store/liveStore';
import { findPlayer, getPlayer } from '../data/players';
import { lastName, fmtScore } from '../data/format';
import { isSquadValid } from '../data/squadRules';
import {
  ROUNDS, isEliminated, tournamentStarted, liveRoundStatus, liveLeaderRound,
  leaderOfRecord, liveScore, roundStarted, transferWindowOpen,
} from '../data/tournament';
import { TOURNAMENT } from '../data/tournamentConfig';
import { useCountdown } from './Countdown';
import type { GameStore } from '../store/gameStore';

// ── "Your next move" — the always-present coach on Home ───────────────────────
// It answers "what should I do right now?" for wherever THIS manager and THIS tournament
// actually are — before the tournament, before a round, during a round, once it's over, and
// the mid-tournament sign-up who can't draft. Every done/pending flag is derived from the
// manager's real state (squad, captain of record, eliminations, transfers) + the live results,
// so the card is correct for each user at all times.

type Accent = 'blue' | 'ember' | 'green' | 'gold';
const AC: Record<Accent, { c: string; soft: string; bd: string }> = {
  blue:  { c: 'var(--blue)',  soft: 'rgba(14,111,196,0.07)', bd: 'rgba(14,111,196,0.30)' },
  ember: { c: 'var(--ember)', soft: 'rgba(229,71,43,0.07)',  bd: 'rgba(229,71,43,0.30)' },
  green: { c: 'var(--green)', soft: 'rgba(18,161,80,0.08)',  bd: 'rgba(18,161,80,0.30)' },
  gold:  { c: 'var(--gold)',  soft: 'rgba(217,154,0,0.09)',  bd: 'rgba(217,154,0,0.32)' },
};

interface Step { label: string; sub?: string; done: boolean; go: () => void; }
interface Action { label: string; sub?: string; go: () => void; primary?: boolean; }
interface View {
  accent: Accent; eyebrow: string; title: string; body?: string;
  steps?: Step[]; actions?: Action[];
  deadline?: string; deadlineLabel?: string; // ISO target + "Draft closes in" / "R32 starts in"
}

const fmtLeft = (c: { d: number; h: number; m: number }) =>
  c.d > 0 ? `${c.d}d ${c.h}h` : c.h > 0 ? `${c.h}h ${c.m}m` : `${c.m}m`;
const nameOf = (id: string | undefined) => (id && findPlayer(id) ? lastName(getPlayer(id).name) : null);

export default function NextMove({ hasPrivateLeague, onPickLeaders }: { hasPrivateLeague: boolean; onPickLeaders: () => void }) {
  const s = useGameStore();
  const setTab = s.setActiveTab;
  // Subscribe to the live draw + results so eliminations / round changes re-derive the card.
  useLiveStore(x => x.draw);
  useLiveStore(x => x.results);

  const view = buildView(s, hasPrivateLeague, onPickLeaders, setTab);
  const cd = useCountdown(view.deadline); // hook runs every render (target may be undefined → null)

  const ac = AC[view.accent];
  const currentStep = view.steps?.find(st => !st.done);

  return (
    <div className="rounded-2xl p-4 sm:p-5 fade-in" style={{ background: ac.soft, border: `1px solid ${ac.bd}` }}>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: ac.c }}>{view.eyebrow}</div>
      <h2 className="text-lg sm:text-xl font-extrabold mt-1 leading-tight" style={{ color: 'var(--ink)' }}>{view.title}</h2>
      {view.body && <p className="text-[13px] mt-1" style={{ color: 'var(--ink-2)' }}>{view.body}</p>}
      {cd && (
        <div className="text-[11px] font-num font-bold mt-2 inline-flex items-center gap-1.5" style={{ color: ac.c }}>
          ⏱ {view.deadlineLabel} {fmtLeft(cd)}
        </div>
      )}

      {view.steps && (
        <ol className="mt-3 flex flex-col gap-0.5">
          {view.steps.map((st, i) => {
            const isCurrent = st === currentStep;
            return (
              <li key={i}>
                <button onClick={st.go} className="w-full flex gap-2.5 items-start text-left py-1.5 rounded-lg transition-colors hover:bg-black/[0.03]">
                  <span className="shrink-0 mt-px w-[18px] h-[18px] rounded-md grid place-items-center text-[11px] font-extrabold"
                    style={st.done
                      ? { background: 'var(--green)', color: '#fff' }
                      : isCurrent
                        ? { border: `1.6px solid ${ac.c}`, boxShadow: `0 0 0 3px ${ac.soft}`, color: 'transparent' }
                        : { border: '1.6px solid var(--ink-3)', color: 'transparent' }}>
                    {st.done ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]" style={{ fontWeight: 650, color: st.done ? 'var(--ink-3)' : 'var(--ink)', textDecoration: st.done ? 'line-through' : 'none' }}>{st.label}</span>
                    {st.sub && <span className="block text-[11px] leading-snug" style={{ color: 'var(--ink-3)' }}>{st.sub}</span>}
                  </span>
                  {isCurrent && <span className="shrink-0 text-sm font-bold" style={{ color: ac.c }}>→</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {view.actions && (
        <div className="flex flex-col gap-2 mt-3">
          {view.actions.map((a, i) => (
            <button key={i} onClick={a.go} className="w-full py-2.5 px-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-transform active:scale-[0.99]"
              style={a.primary ? { background: ac.c, color: '#fff' } : { background: 'transparent', color: ac.c, border: `1px solid ${ac.bd}` }}>
              <span className="min-w-0 text-left">
                {a.label}
                {a.sub && <span className="block text-[11px] font-medium" style={{ opacity: 0.82 }}>{a.sub}</span>}
              </span>
              <span className="ml-auto shrink-0">→</span>
            </button>
          ))}
        </div>
      )}

      {view.steps && (
        <button
          onClick={(currentStep ?? { go: () => setTab('tournament') }).go}
          className="w-full mt-3 py-2.5 rounded-xl font-bold text-sm text-white transition-transform active:scale-[0.99]"
          style={{ background: ac.c }}>
          {currentStep ? `${currentStep.label} →` : 'See the live draw →'}
        </button>
      )}
    </div>
  );
}

// ── the state machine — pure, testable, derived entirely from real state ──────
export function buildView(s: GameStore, hasPrivateLeague: boolean, onPickLeaders: () => void, setTab: GameStore['setActiveTab']): View {
  const { phase, myTeam, initialSquad, transfers, captain, viceCaptain, captainHistory, viceCaptainHistory, finalized } = s;
  const firstRound = TOURNAMENT.rounds[0];

  // A brand-new sign-up during a LIVE event: the draft is closed, so don't offer a dead draft.
  if (phase === 'draft' && tournamentStarted()) {
    return {
      accent: 'blue', eyebrow: 'Draft closed',
      title: `${TOURNAMENT.name} is already underway`,
      body: 'Drafting for this event has closed — but you’re all set to play the next one. Follow this one live in the meantime.',
      actions: [
        { label: 'Watch the live bracket', sub: 'follow every match', go: () => setTab('tournament'), primary: true },
        { label: 'See the leaderboard', sub: 'how the league stands', go: () => setTab('league') },
      ],
    };
  }

  // BEFORE THE TOURNAMENT — build a valid, captained, locked squad (+ set up your league).
  if (phase === 'draft') {
    const leagueDone = hasPrivateLeague || myTeam.length > 0;   // joined a league OR started drafting (playing the world)
    const squadDone = isSquadValid(myTeam);                     // 10 valid players · 2/3/5
    const capDone = !!captain && !!viceCaptain;                 // both leaders chosen
    const steps: Step[] = [
      { label: 'Create your league', sub: leagueDone ? undefined : 'join with a code · or just play the world', done: leagueDone, go: () => setTab('league') },
      { label: 'Draft your 10 players', sub: squadDone ? undefined : `${myTeam.length}/10 · 2 Platinum · 3 Gold · 5 Silver`, done: squadDone, go: () => setTab('draft') },
      { label: 'Pick your Captain & Vice', sub: capDone ? undefined : '×2 and ×1.5 on their points', done: capDone, go: onPickLeaders },
      { label: 'Lock your squad', sub: 'before the first match', done: false, go: () => setTab('draft') },
    ];
    return { accent: 'blue', eyebrow: 'Before the tournament', title: 'Get set for the draw', steps,
      deadline: TOURNAMENT.schedule?.[firstRound], deadlineLabel: 'Draft closes in' };
  }

  // FINISHED — every round has played out (phase stays pre_round in production, so derive it).
  const st = liveRoundStatus();
  if (phase === 'finished' || !st) {
    const score = liveScore(initialSquad, transfers, captainHistory, viceCaptainHistory);
    return {
      accent: 'gold', eyebrow: 'Tournament over',
      title: `You finished on ${fmtScore(score)} points`,
      body: 'That’s a wrap. See where you landed in the league and how each of your picks scored across the draw.',
      actions: [
        { label: 'See your final standing', sub: 'the full league table', go: () => setTab('league'), primary: true },
        { label: 'Review your run', sub: 'round-by-round on your team page', go: () => s.openTeam('you') },
      ],
    };
  }

  const roundObj = ROUNDS.find(r => r.id === st.round)!;

  // ROUND LOCKED, NOT YET PLAYING — the scheduled start has passed but no result has landed. The
  // schedule is often an ESTIMATE (finals-day order of play publishes late), so we must NOT claim
  // the match is underway; we only know we've frozen everyone's picks. Same "nothing to change"
  // shape as the live card, honest wording.
  if (st.underway && !st.live) {
    return {
      accent: 'ember', eyebrow: `${roundObj.short} about to begin`,
      title: `The ${roundObj.label} is about to begin`,
      body: 'Your captain and any signings are locked for this round. Points start landing as soon as the first match finishes.',
      actions: [
        { label: 'See the draw', sub: 'your players are highlighted', go: () => setTab('tournament'), primary: true },
        { label: 'See the leaderboard', sub: 'where you sit in the league', go: () => setTab('league') },
      ],
    };
  }

  // DURING A ROUND — genuinely playing (a result proves it); nothing to change, watch it unfold.
  if (st.underway) {
    const score = liveScore(initialSquad, transfers, captainHistory, viceCaptainHistory);
    return {
      accent: 'green', eyebrow: `${roundObj.short} is live`,
      title: `The ${roundObj.label} is underway`,
      body: `You’re on ${fmtScore(score)} pts — points update automatically as your players win. Captains are locked for this round; nothing to change.`,
      actions: [
        { label: 'Check the results live', sub: 'your players are highlighted', go: () => setTab('tournament'), primary: true },
        { label: 'See your score', sub: 'where you sit in the league', go: () => setTab('league') },
      ],
    };
  }

  // BEFORE A ROUND — replace the fallen, set this round's captain, confirm.
  const leaderRound = liveLeaderRound();
  const eliminated = myTeam.filter(id => isEliminated(id));
  const replaceDone = eliminated.length === 0;
  const effCap = leaderRound ? leaderOfRecord(captainHistory, leaderRound) : undefined;
  const effVice = leaderRound ? leaderOfRecord(viceCaptainHistory, leaderRound) : undefined;
  const capAlive = !!effCap && !isEliminated(effCap);
  const viceAlive = !!effVice && !isEliminated(effVice);
  const capDone = capAlive && viceAlive;
  // A fresh signing is "unlocked" until the round it first scores in starts — confirm or it auto-locks.
  const hasUnlocked = transfers.some(t => {
    const scoresFrom = ROUNDS[ROUNDS.findIndex(r => r.id === t.round) + 1]?.id;
    return scoresFrom && !roundStarted(scoresFrom) && !isEliminated(t.in);
  });
  const capName = nameOf(effCap);
  const capSub = capDone
    ? (capName ? `${capName} captains — ×2, locks when ${roundObj.short} starts` : undefined)
    : (effCap && !capAlive ? 'your captain is out — pick a new one' : `choose your ×2 & ×1.5 for the ${roundObj.short}`);

  // The market is a between-rounds desk that shuts FOR GOOD after the semi-finals: a signing then
  // could only score in the Final, and an elimination refunds 0 — so buyPlayer/cashInPlayer both
  // refuse. Offering "replace your eliminated players" there sends the manager to a Market where
  // every button is dead, so say the squad is final instead. (Mirrors transferWindowOpen exactly,
  // the same guard the store commits against, so the card can never invite a rejected action.)
  const marketOpen = transferWindowOpen();
  const replaceStep: Step = marketOpen
    ? { label: 'Replace eliminated players', sub: replaceDone ? 'no one knocked out — you’re covered' : `${eliminated.length} knocked out — cash in & sign replacements`, done: replaceDone, go: () => setTab('draft') }
    : { label: 'Squad is final', sub: 'no transfers after the semi-finals — play the squad you have', done: true, go: () => setTab('draft') };

  // "Lock Squad" (finalized) is the manager's EXPLICIT confirmation of their unlocked signings —
  // honour it, or the step stays open forever after they've clicked it (they lock, nothing ticks).
  // Done when there's nothing pending, or when they've locked what is.
  const lockDone = !hasUnlocked || finalized;
  const steps: Step[] = [
    replaceStep,
    { label: `Set your captain for the ${roundObj.short}`, sub: capSub, done: capDone, go: onPickLeaders },
    { label: 'Lock your squad', sub: !hasUnlocked ? 'you’re set for the round' : finalized ? 'signings confirmed — locked in' : 'confirm your signings — they auto-lock at the first ball', done: lockDone, go: () => setTab('draft') },
  ];
  return { accent: 'ember', eyebrow: `Before the ${roundObj.short}`, title: `Get ready for the ${roundObj.label}`, steps,
    deadline: TOURNAMENT.schedule?.[st.round], deadlineLabel: `${roundObj.short} starts in` };
}
