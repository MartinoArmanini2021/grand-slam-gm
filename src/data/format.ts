// Small display helpers shared across the UI.

/** Surname / last token of a player's name (e.g. "Jannik Sinner" → "Sinner"). */
export const lastName = (name: string): string => name.split(' ').slice(-1)[0] ?? name;

/** Round money to a single decimal ($0.1M granularity). The one place the game's
 *  money rounding rule lives — used by the store and the rival engine so budgets
 *  can't drift or accumulate float error. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A fantasy SCORE / points value for DISPLAY: always exactly one decimal place, so
 *  points read uniformly across the app (12 → "12.0", 12.5 → "12.5"). Rounds to 0.1
 *  first to shed float dust. Use this for every on-screen points value. */
export const fmtScore = (n: number): string => round1(n).toFixed(1);

/** Ordinal for a finishing position: 1 → "1st", 2 → "2nd", 11 → "11th", 21 → "21st".
 *  Lives here, and is tested, because the 11–13 exception is the classic way this goes
 *  wrong: a naive last-digit rule confidently renders "11st" in front of the one manager
 *  who came eleventh. Public leagues can be large enough for that to be a real position. */
export const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
