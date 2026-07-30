import { useSync } from '../store/syncStore';

// Explicit save affordance for the player's own squad, shown top-right on the court.
// Reflects the true sync status and lets the player force an immediate save. Auto-save
// still runs in the background — this is for confidence + manual control.
const STYLES = {
  saved:   { label: 'Saved',        icon: '✓', bg: 'rgba(18,161,80,0.92)',  border: 'rgba(18,161,80,0.5)',  actionable: false },
  unsaved: { label: 'Save',         icon: '', bg: 'var(--blue)',            border: 'rgba(255,255,255,0.35)', actionable: true },
  saving:  { label: 'Saving…',      icon: '', bg: 'rgba(10,31,68,0.85)',    border: 'rgba(255,255,255,0.25)', actionable: false },
  error:   { label: 'Retry save',   icon: '↻', bg: 'rgba(229,71,43,0.95)',   border: 'rgba(255,255,255,0.35)', actionable: true },
} as const;

export default function SaveButton() {
  const status = useSync(s => s.status);
  const saveNow = useSync(s => s.saveNow);
  const s = STYLES[status];
  return (
    <button
      onClick={() => { if (s.actionable) saveNow(); }}
      disabled={!s.actionable}
      aria-label={status === 'unsaved' ? 'Save your squad' : status === 'error' ? 'Retry saving your squad' : `Squad ${status}`}
      title={status === 'saved' ? 'Your squad is saved' : status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed — tap to retry' : 'Save your squad'}
      className="flex items-center gap-1.5 px-3 min-h-[32px] rounded-full text-xs font-extrabold text-white transition-all"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: s.actionable ? '0 3px 10px rgba(0,0,0,0.3)' : 'none',
        cursor: s.actionable ? 'pointer' : 'default',
        opacity: status === 'saving' ? 0.85 : 1,
      }}
    >
      {status === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#fff', display: 'inline-block' }} />}
      {s.icon && <span aria-hidden>{s.icon}</span>}
      <span>{s.label}</span>
    </button>
  );
}
