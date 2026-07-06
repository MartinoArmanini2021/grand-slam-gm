export type Tier = 'Platinum' | 'Gold' | 'Silver';

// Tier by ATP ranking (stable, independent of the price curve):
// top 6 are Platinum, next 10 Gold, the rest Silver.
export function getTier(ranking: number): Tier {
  if (ranking <= 6) return 'Platinum';
  if (ranking <= 16) return 'Gold';
  return 'Silver';
}

export const TIER_META: Record<Tier, { label: string; color: string; soft: string; order: number }> = {
  Platinum: { label: 'Platinum', color: '#7DE2FC', soft: 'rgba(125,226,252,0.12)', order: 0 },
  Gold:     { label: 'Gold',     color: '#FBBF3B', soft: 'rgba(251,191,59,0.12)',  order: 1 },
  Silver:   { label: 'Silver',   color: '#AEB8C4', soft: 'rgba(174,184,196,0.12)', order: 2 },
};

export const TIER_ORDER: Tier[] = ['Platinum', 'Gold', 'Silver'];
