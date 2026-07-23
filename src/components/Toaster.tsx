import { useToasts } from '../store/toastStore';

const STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  good: { bg: 'var(--green)', color: '#fff', icon: '✓' },
  warn: { bg: 'var(--ember)', color: '#fff', icon: '!' },
  info: { bg: 'var(--ink)', color: '#fff', icon: '›' },
};

export default function Toaster() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 20, zIndex: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        pointerEvents: 'none', padding: '0 16px',
      }}
    >
      {toasts.map(t => {
        const s = STYLE[t.kind] ?? STYLE.info;
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="fade-in"
            style={{
              pointerEvents: 'auto', cursor: 'pointer', border: 'none',
              background: s.bg, color: s.color,
              borderRadius: 12, padding: '10px 16px 10px 12px',
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: '"Plus Jakarta Sans Variable",system-ui,sans-serif',
              fontSize: 14, fontWeight: 600, maxWidth: 440,
              boxShadow: '0 8px 24px rgba(10,27,51,0.28)',
            }}
          >
            <span
              style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 12,
              }}
            >
              {s.icon}
            </span>
            {t.msg}
          </button>
        );
      })}
    </div>
  );
}
