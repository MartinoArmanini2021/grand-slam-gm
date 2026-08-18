import { describe, it, expect } from 'vitest';
import { TOURNAMENTS, type Tournament, type TournamentStatus } from '../data/tournamentConfig';

// ── Rehearsing the Cincinnati → US Open changeover (Phase 2.3) ───────────────────────────────────
//
// The real cutover is a config edit (docs/TOURNAMENT_CHANGEOVER.md step 2.4): Cincinnati becomes
// 'completed', the US Open becomes 'live'. tournamentConfig resolves its exports ONCE at module
// load, so the live module can only ever describe today's state — it cannot answer "what happens
// the morning after the switch". These tests re-implement the three derivations against a simulated
// registry, so the day-after state is checked now rather than discovered on the day.
//
// The last cutover is what caused the 12-hour silent freeze. A rehearsal that cannot be run before
// the event is not a rehearsal.

// Mirrors resolveActiveId() / SELECTABLE_TOURNAMENTS / IS_READ_ONLY. Kept deliberately small and
// explicit: if the real derivations change shape, these stop matching and someone has to think.
const selectable = (reg: Record<string, Tournament>) => Object.values(reg).filter(t => t.status !== 'staged');
const resolve = (reg: Record<string, Tournament>, stored?: string) => {
  if (stored && reg[stored] && reg[stored].status !== 'staged') return stored;
  return (Object.values(reg).find(t => t.status === 'live') ?? selectable(reg)[0])?.id;
};
const readOnly = (reg: Record<string, Tournament>, id: string | undefined) =>
  !!id && reg[id]?.status === 'completed';

// The registry as it will be the morning after the switch.
const afterSwitch: Record<string, Tournament> = Object.fromEntries(
  Object.entries(TOURNAMENTS).map(([id, t]) => {
    const status: TournamentStatus =
      id === 'cincinnati_2026' ? 'completed' : id === 'usopen_2026' ? 'live' : t.status;
    return [id, { ...t, status }];
  }),
);

describe('the morning after the changeover', () => {
  it('still has exactly one live tournament', () => {
    expect(Object.values(afterSwitch).filter(t => t.status === 'live').map(t => t.id)).toEqual(['usopen_2026']);
  });

  // The bug this replaced: a hardcoded DEFAULT_TOURNAMENT_ID that said 'cincinnati_2026'. After the
  // switch that would have opened every new manager on a finished draw with nothing to play.
  it('a brand-new manager opens on the US Open', () => {
    expect(resolve(afterSwitch)).toBe('usopen_2026');
    expect(readOnly(afterSwitch, resolve(afterSwitch))).toBe(false);
  });

  // A returning manager whose stored choice is the event that just ended. They should land there —
  // seeing how they finished is the point — but read-only, with a way out.
  it('a Cincinnati regular lands on Cincinnati, read-only', () => {
    const id = resolve(afterSwitch, 'cincinnati_2026');
    expect(id).toBe('cincinnati_2026');
    expect(readOnly(afterSwitch, id)).toBe(true);
  });

  it('a Montréal regular still lands on Montréal, read-only', () => {
    const id = resolve(afterSwitch, 'montreal_2026');
    expect(id).toBe('montreal_2026');
    expect(readOnly(afterSwitch, id)).toBe(true);
  });

  // BUG 2 from Phase 2.1, checked against the state that would actually trigger it. The switcher
  // hides itself when there is only one entry; anyone stranded on a finished event would then have
  // no way back to the live one.
  it('the switcher renders, so nobody is stranded on a finished event', () => {
    const ids = selectable(afterSwitch).map(t => t.id);
    expect(ids).toContain('cincinnati_2026');
    expect(ids).toContain('usopen_2026');
    expect(ids.length).toBeGreaterThan(1);
  });

  it('every completed event has a live one to escape to', () => {
    const live = Object.values(afterSwitch).filter(t => t.status === 'live');
    for (const done of Object.values(afterSwitch).filter(t => t.status === 'completed')) {
      expect(live.length, `${done.id} has nowhere to send anyone`).toBeGreaterThan(0);
    }
  });
});

// The same derivations against TODAY's registry, so the rehearsal is checked against reality and
// not only against its own simulation. If these disagree with the live exports, the helpers above
// have drifted and the rehearsal above is measuring nothing.
describe('the rehearsal helpers match the real config', () => {
  it('agree with the live registry today', async () => {
    const real = await import('../data/tournamentConfig');
    expect(selectable(TOURNAMENTS).map(t => t.id)).toEqual(real.SELECTABLE_TOURNAMENTS.map(t => t.id));
    expect(resolve(TOURNAMENTS)).toBe(real.ACTIVE_TOURNAMENT_ID);
    expect(readOnly(TOURNAMENTS, real.ACTIVE_TOURNAMENT_ID)).toBe(real.IS_READ_ONLY);
  });
});
