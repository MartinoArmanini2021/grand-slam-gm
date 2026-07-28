import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { PLAYERS } from '../data/players';
import { getTier } from '../data/tiers';
import { isSquadValid } from '../data/squadRules';

// Regression guards for the end-of-day review fixes.
const g = () => useGameStore.getState();

describe('store hardening', () => {
  beforeEach(() => { g().resetGame(); useProfile.getState().reset(); });

  it('resetGame wipes the squad, score, and progress to defaults', () => {
    const p = PLAYERS[0];
    g().addPlayer(p.id);
    useGameStore.setState({ myScore: 42, currentRoundIndex: 3 });
    g().resetGame();
    expect(g().myTeam).toEqual([]);
    expect(g().myScore).toBe(0);
    expect(g().currentRoundIndex).toBe(0);
    expect(g().phase).toBe('draft');
    expect(g().budget).toBe(200);
  });

  it('profile reset() clears identity + team back to defaults (no cross-account bleed)', () => {
    useProfile.getState().set({ firstName: 'Martino', teamName: 'Astros', country: 'Italy' });
    useProfile.getState().reset();
    const s = useProfile.getState();
    expect(s.firstName).toBe('');
    expect(s.country).toBe('');
    expect(s.teamName).toBe('My Team');
    expect(s.teamEmblem).toBe('🎾');
  });

  it('setCaptain is a no-op outside draft / pre_round', () => {
    const p = PLAYERS[0];
    g().addPlayer(p.id);
    g().setCaptain(p.id);          // draft phase → allowed
    expect(g().captain).toBe(p.id);
    useGameStore.setState({ phase: 'finished', captain: null });
    g().setCaptain(p.id);          // finished → blocked
    expect(g().captain).toBeNull();
  });

  it('a valid 2-Platinum + 3-Gold + 5-Silver squad builds and locks (tier rule holds)', () => {
    const byPrice = (t: string) => PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => a.price - b.price);
    const picks = [...byPrice('Platinum').slice(0, 2), ...byPrice('Gold').slice(0, 3), ...byPrice('Silver').slice(0, 5)];
    for (const p of picks) g().addPlayer(p.id);
    expect(g().myTeam).toHaveLength(10);
    expect(isSquadValid(g().myTeam)).toBe(true);
    g().finalizeDraft();
    expect(g().phase).toBe('pre_round');
    // defaults: two distinct on-court leaders (captain + vice), both real members
    expect(g().myTeam).toContain(g().captain);
    expect(g().myTeam).toContain(g().viceCaptain);
    expect(g().captain).not.toBe(g().viceCaptain);
  });
});
