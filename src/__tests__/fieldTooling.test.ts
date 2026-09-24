import { describe, it, expect } from 'vitest';
import { EVENTS } from '../../scripts/lib/events.mjs';
import { tierOf, priceOf } from '../../scripts/lib/pricing.mjs';
import { PLAYERS } from '../data/players';
import { getTier } from '../data/tiers';
import { TOURNAMENTS, TOURNAMENT, wikipediaPageFor } from '../data/tournamentConfig';

// The field/seed generators run in Node, which can't import the app's modules (players.ts pulls in
// tournamentConfig → import.meta.env, a Vite-only global). So scripts/lib/ carries a deliberate copy
// of the pricing + tier rules and of each event's Wikipedia page. A copy that silently drifts is
// worse than no copy: the seed would price a player differently from the app, and save_entry would
// then reject a squad the market said was affordable. These tests are what stop that.

describe('tooling ↔ app parity: pricing and tiers', () => {
  it('prices every player in the ACTIVE field exactly as the app does', () => {
    const surface = TOURNAMENT.surface as 'hard' | 'clay' | 'grass';
    const wrong = PLAYERS
      .map(p => ({ p, tooling: priceOf(p.ranking, p.ytd, p.surface?.[surface]) }))
      .filter(({ p, tooling }) => tooling !== p.price)
      .map(({ p, tooling }) => `${p.name}: app $${p.price} vs tooling $${tooling}`);
    expect(wrong).toEqual([]);
  });

  it('tiers every player exactly as the app does', () => {
    const wrong = PLAYERS.filter(p => tierOf(p.ranking) !== getTier(p.ranking)).map(p => p.name);
    expect(wrong).toEqual([]);
  });
});

describe('tooling ↔ app parity: the event registry', () => {
  it('every event id it knows about is a real tournament', () => {
    for (const id of Object.keys(EVENTS)) expect(TOURNAMENTS[id], `unknown tournament "${id}"`).toBeDefined();
  });

  it('each Wikipedia page matches the one the live feed derives', () => {
    // liveData builds it with wikipediaPageFor ("– Men's singles", or "– Singles" at a men-only
    // event). If the tooling read a different page, the field would be built from one draw and
    // scored against another.
    for (const [id, ev] of Object.entries(EVENTS)) {
      const t = TOURNAMENTS[id];
      expect(ev.page, `page for ${id}`).toBe(wikipediaPageFor(t));
    }
  });

  it('each event writes its field where players.ts reads it from', () => {
    for (const [id, ev] of Object.entries(EVENTS)) {
      expect(ev.field, `field path for ${id}`).toMatch(/^src\/data\/.+Field\.json$/);
      expect(ev.seed, `seed path for ${id}`).toMatch(/^supabase\/seed_.+\.sql$/);
    }
  });

  it('hand-entered entrants carry a real rank outside the top-300 pool', () => {
    // The whole reason they're hand-entered. A pooled player here would silently shadow real stats.
    for (const [id, ev] of Object.entries(EVENTS)) {
      for (const m of ev.manual ?? []) {
        expect(m.ranking, `${id}: ${m.name} should be outside the pool`).toBeGreaterThan(300);
        expect(m.name.length, `${id}: manual entrant needs a name`).toBeGreaterThan(2);
      }
    }
  });
});
