import { useEscapeToClose } from '../hooks';

// "How transfers work" — a click-to-open help card for the live Market, explaining the
// build → confirm → lock flow for replacing eliminated players.
export default function TransferHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeToClose(onClose, open);
  if (!open) return null;
  const stages: { n: string; title: string; body: React.ReactNode }[] = [
    { n: '1', title: 'A player is knocked out', body: <>They show <b style={{ color: 'var(--ember)' }}>OUT</b> in My Squad with the refund waiting, and drop out of the market list — you only see players still in the draw.</> },
    { n: '2', title: 'Cash In — happens right away', body: <>Tap <b style={{ color: 'var(--ember)' }}>Cash In +$X</b> on an eliminated player. The refund lands in your budget immediately and an <b>open slot</b> opens up. That's it — no saving needed.</> },
    { n: '3', title: 'Buy a replacement', body: <>Tap <b style={{ color: 'var(--green)' }}>+ Buy</b> on any still-alive player — <b>any tier</b>. They join your squad straight away, marked <b style={{ color: 'var(--gold)' }}>NEW</b>.</> },
    { n: '4', title: 'Change your mind? Undo', body: <>A new signing stays <b>unlocked</b> — tap <b>Undo</b> to swap them for someone else any time before the round starts.</> },
    { n: '5', title: 'It locks itself', body: <>When the round begins, your signings <b>lock in</b> automatically. In a hurry to be sure? Tap <b style={{ color: 'var(--blue)' }}>Lock Squad</b> to finalise early.</> },
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(10,27,51,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="How transfers work" className="fade-in rounded-2xl w-full" style={{ maxWidth: 420, background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between" style={{ borderBottom: '1px solid rgba(10,27,51,0.08)' }}>
          <div>
            <div className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>How transfers work</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>Replacing your eliminated players, step by step.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ color: 'var(--ink-3)', background: 'rgba(10,27,51,0.04)' }}>✕</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3.5">
          {stages.map(s => (
            <div key={s.n} className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold" style={{ background: 'var(--blue)', color: '#fff' }}>{s.n}</span>
              <div className="min-w-0">
                <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{s.title}</div>
                <div className="text-[13px] leading-snug mt-0.5" style={{ color: 'var(--ink-2)' }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5">
          <div className="rounded-xl px-3.5 py-3 text-[12px] leading-relaxed" style={{ background: 'var(--raised)', color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)' }}>Good to know</b>
            <ul className="mt-1.5 flex flex-col gap-1" style={{ listStyle: 'disc', paddingLeft: 18 }}>
              <li>You can cash in and <i>not</i> buy — keep the money and run a smaller squad. Any tier mix is fine.</li>
              <li>A new player scores from the <b>next</b> round, never a round already played.</li>
              <li>Transfers <b>lock for the Final</b> — no changes after the semi-finals.</li>
              <li>The refund depends on how far the player got — a quarter-finalist returns more than an early exit.</li>
            </ul>
          </div>
          <button onClick={onClose} className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--blue)' }}>Got it</button>
        </div>
      </div>
    </div>
  );
}
