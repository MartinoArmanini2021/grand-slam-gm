export type Tier = 'Platinum' | 'Gold' | 'Silver';

// Tier by ATP ranking (stable, independent of the price curve):
// top 6 are Platinum, next 10 Gold, the rest Silver.
export function getTier(ranking: number): Tier {
  if (ranking <= 6) return 'Platinum';
  if (ranking <= 16) return 'Gold';
  return 'Silver';
}

export const TIER_META: Record<Tier, { label: string; color: string }> = {
  Platinum: { label: 'Platinum', color: '#7DE2FC' },
  Gold:     { label: 'Gold',     color: '#FBBF3B' },
  Silver:   { label: 'Silver',   color: '#AEB8C4' },
};

export const TIER_ORDER: Tier[] = ['Platinum', 'Gold', 'Silver'];
