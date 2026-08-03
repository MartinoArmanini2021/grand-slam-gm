// Shown above a leaderboard before the tournament produces its first result, so a board full
// of 0s reads as "not started yet" rather than broken. Hidden the moment scoring goes live.
export default function ScoringPendingNote() {
  return (
    <div
      className="rounded-xl px-3 py-2 mb-2.5 text-xs font-semibold flex items-center gap-2"
      style={{ background: 'rgba(14,111,196,0.08)', border: '1px solid rgba(14,111,196,0.2)', color: 'var(--blue)' }}
    >
      <span aria-hidden>🎾</span>
      <span>Tournament hasn’t started — scores go live the moment play begins.</span>
    </div>
  );
}
