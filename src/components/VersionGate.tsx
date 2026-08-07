import { useState, useEffect, useRef } from 'react';

// Keep every manager on the SAME build. This app is a hashed-bundle SPA: when we deploy, Cloudflare
// rewrites index.html to reference a new index-<hash>.js, but a tab that's already open keeps
// running the OLD code (and old market/scoring logic) until it reloads. This compares the bundle
// THIS tab loaded against the one the server currently serves, and when they differ shows a
// persistent "reload" banner — so nobody is silently stuck on a stale version. Prompt (not auto-
// reload) because a reload would drop unsaved staged market changes.
function bundleName(html: string): string | null {
  return html.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;
}

// The bundle THIS document loaded — read straight off the entry <script> tag.
function loadedBundle(): string | null {
  for (const s of Array.from(document.querySelectorAll('script[src]'))) {
    const m = (s as HTMLScriptElement).src.match(/index-[A-Za-z0-9_-]+\.js/);
    if (m) return m[0];
  }
  return null;
}

export default function VersionGate() {
  const [stale, setStale] = useState(false);
  const current = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;          // dev serves unhashed modules — nothing to compare
    current.current = loadedBundle();
    if (!current.current) return;               // couldn't determine our own build — do nothing
    let stopped = false;
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })).text();
        const live = bundleName(html);
        if (!stopped && live && current.current && live !== current.current) setStale(true);
      } catch { /* offline / transient — ignore, try again next tick */ }
    };
    check();
    const iv = window.setInterval(check, 3 * 60 * 1000);                 // every 3 minutes
    const onVis = () => { if (document.visibilityState === 'visible') check(); }; // and on tab refocus
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; window.clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // A hidden/forgotten background tab can't act on a banner — and that's exactly the kind of tab
  // that gets stuck in a runaway background loop. Once a newer build is out, reload such tabs
  // automatically so they land on the current (fixed) code; a VISIBLE tab keeps the prompt below.
  useEffect(() => {
    if (!stale) return;
    if (document.visibilityState === 'hidden') { window.location.reload(); return; }
    const onHide = () => { if (document.visibilityState === 'hidden') window.location.reload(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stale]);

  if (!stale) return null;
  return (
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 500, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div className="fade-in" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 560, width: '100%', padding: '12px 14px', borderRadius: 14, background: 'var(--ink)', color: '#fff', boxShadow: '0 10px 30px rgba(10,27,51,0.35)' }}>
        <span style={{ fontSize: 18 }}>🔄</span>
        <span className="text-sm font-semibold" style={{ flex: 1 }}>A new version of Grand Slam GM is ready — reload to get the latest.</span>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-bold px-3 py-1.5 rounded-lg shrink-0"
          style={{ background: '#fff', color: 'var(--ink)' }}
        >Reload</button>
      </div>
    </div>
  );
}
