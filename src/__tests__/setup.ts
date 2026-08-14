import { vi } from 'vitest';

// Freeze the wall clock to BEFORE the live tournament (schedule starts Aug 2026) so the new
// schedule-aware `roundStarted()` never fires from the clock in the general suite — every test
// drives round state purely through injected RESULTS, deterministically, exactly as before. Only
// `Date` is faked (not setTimeout/setInterval), so async tests are unaffected. Tests that need to
// exercise the schedule-based "round has started" path set the clock explicitly with vi.setSystemTime.
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));

// In-memory localStorage so the persisted zustand store works under Node.
class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(k: string) { return k in this.store ? this.store[k] : null; }
  setItem(k: string, v: string) { this.store[k] = String(v); }
  removeItem(k: string) { delete this.store[k]; }
  clear() { this.store = {}; }
  key(i: number) { return Object.keys(this.store)[i] ?? null; }
  get length() { return Object.keys(this.store).length; }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

// Silence ONE specific zustand warning. Its persist middleware defaults to `window.localStorage`
// (not the bare global we set above), and the suite runs in the `node` environment where there is
// no `window` — so every persisted set() logged a warning, thousands of lines per run, burying the
// actual test output. We deliberately do NOT shim `window`: half the app branches on
// `typeof window !== 'undefined'`, so inventing one would silently flip those paths under test.
// Persistence itself isn't under test here (every test drives state directly), so the warning is
// pure noise. Anything else console.warn says still comes through.
const ZUSTAND_NO_STORAGE = '[zustand persist middleware] Unable to update item';
const realWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith(ZUSTAND_NO_STORAGE)) return;
  realWarn(...args);
};
