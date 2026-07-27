// Admin (operator) mode — whoever is running a live tournament and can enter or
// correct results. A local flag for now: there are no backend roles yet (that's the
// server-authoritative W5 step). Toggle it from the profile menu.
const KEY = 'gsgm-admin';

export function isAdmin(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setAdmin(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
