export type Tier = 'Platinum' | 'Gold' | 'Silver';

// Tier by ATP ranking (stable, independent of the price curve):
// top 10 are Platinum, the next 15 (11–25) Gold, the rest Silver.
export function getTier(ranking: number): Tier {
  if (ranking <= 10) return 'Platinum';
  if (ranking <= 25) return 'Gold';
  return 'Silver';
}

export const TIER_META: Record<Tier, { label: string; color: string }> = {
  Platinum: { label: 'Platinum', color: '#7DE2FC' },
  Gold:     { label: 'Gold',     color: '#FBBF3B' },
  Silver:   { label: 'Silver',   color: '#AEB8C4' },
};

export const TIER_ORDER: Tier[] = ['Platinum', 'Gold', 'Silver'];
