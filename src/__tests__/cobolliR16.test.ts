import { describe, it, expect } from 'vitest';
import { leaderOfRecord } from '../data/tournament';

// ── The Cobolli R16 case, pinned against the real production histories ──────────────────────────
//
// Reported 2026-08-20: "Cobolli has different scores for different managers in the same round."
// He does, and it is correct. These are the exact viceCaptainHistory values from board_entries for
// cincinnati_2026 on the morning of 2026-08-20 — copied verbatim, not paraphrased.
//
// The rule: an armband is committed PER ROUND and carried forward from the most recent EARLIER
// round. Nothing applies backwards. Agass's Cobolli entry is dated QF, so it cannot reach the R16;
// their R16 vice is the R32 entry, Mensik. Buzzi2 never changed theirs, so R64 Cobolli carries all
// the way through.
//
// If a future change ever makes a later armband entry leak backwards into an earlier round, this
// test fails — and it fails naming the two managers whose scores would silently move.
const BUZZI2_VICE = [{ round: 'R64', playerId: 'cobolli' }];
const AGASS_VICE = [
  { round: 'R64', playerId: 'cobolli' },
  { round: 'R32', playerId: 'mensik' },
  { round: 'QF', playerId: 'cobolli' },
];

describe('Cobolli in the R16 — same player, same round, two different multipliers', () => {
  it('Buzzi2 never moved the armband, so Cobolli is still their R16 vice', () => {
    expect(leaderOfRecord(BUZZI2_VICE, 'R16')).toBe('cobolli');
  });

  // The crux. Agass DID move it, in the R32, and only moved it back at the QF.
  it('Agass moved the armband to Mensik in the R32, so Mensik is their R16 vice', () => {
    expect(leaderOfRecord(AGASS_VICE, 'R16')).toBe('mensik');
  });

  it('a QF-dated pick never reaches back into an earlier round', () => {
    expect(leaderOfRecord(AGASS_VICE, 'R64')).toBe('cobolli');
    expect(leaderOfRecord(AGASS_VICE, 'R32')).toBe('mensik');
    expect(leaderOfRecord(AGASS_VICE, 'R16')).toBe('mensik'); // carried from R32, NOT the QF
    expect(leaderOfRecord(AGASS_VICE, 'QF')).toBe('cobolli');
  });

  // The two numbers the founder saw, derived end to end. R16 base = 5; Cobolli beat a higher-ranked
  // player in neither case that would change the base, so the ONLY difference is the armband.
  it('produces 7.5 for Buzzi2 and 5 for Agass — the whole discrepancy', () => {
    const R16_BASE = 5;
    const mult = (vice: string | undefined) => (vice === 'cobolli' ? 1.5 : 1);
    expect(R16_BASE * mult(leaderOfRecord(BUZZI2_VICE, 'R16'))).toBe(7.5);
    expect(R16_BASE * mult(leaderOfRecord(AGASS_VICE, 'R16'))).toBe(5);
  });
});
