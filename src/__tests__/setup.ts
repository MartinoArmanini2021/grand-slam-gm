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
