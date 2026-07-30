import { describe, it, expect } from 'vitest';
import { youtubeSearchUrl } from '../data/video';
import { PLAYER_POOL } from '../data/playerPool';

// The "watch the players" feature must produce a valid, safe YouTube search link for
// EVERY player in the pool — not just the ~74 in the current field — since players show
// up in the market, the picker, head-to-head and the player page. These tests guard that
// promise across all 300 pool players (names with spaces, hyphens, apostrophes, accents).

describe('youtubeSearchUrl', () => {
  it('covers the whole 300-player pool', () => {
    expect(PLAYER_POOL.length).toBeGreaterThanOrEqual(300);
  });

  it('builds a valid, correctly-encoded YouTube search URL for every pool player', () => {
    for (const p of PLAYER_POOL) {
      const url = youtubeSearchUrl(p.name);

      // Points at the YouTube results (search) page — the requested behaviour.
      expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true);

      // Parses as a real URL and carries the player's name in the query (round-trips
      // exactly through decoding, so special characters are safely encoded — no spaces,
      // no '#', '&' or '?' leaking out to break the link).
      const parsed = new URL(url);
      const q = parsed.searchParams.get('search_query');
      expect(q).toBe(`${p.name} tennis highlights`);
      expect(url).not.toMatch(/\s/); // no raw whitespace in the emitted URL
    }
  });

  it('encodes tricky characters (space, hyphen, apostrophe, accent, dot)', () => {
    const cases = ["Félix Auger-Aliassime", "Alex de Minaur", "Juan Martín del Potro", "Frances Tiafoe Jr."];
    for (const name of cases) {
      const url = youtubeSearchUrl(name);
      expect(new URL(url).searchParams.get('search_query')).toBe(`${name} tennis highlights`);
    }
  });
});
