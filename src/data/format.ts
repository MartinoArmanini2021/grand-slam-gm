// Small display helpers shared across the UI.

/** Surname / last token of a player's name (e.g. "Jannik Sinner" → "Sinner"). */
export const lastName = (name: string): string => name.split(' ').slice(-1)[0];
