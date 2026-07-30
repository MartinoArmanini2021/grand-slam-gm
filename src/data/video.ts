// A YouTube search link for a player, so a casual fan can watch them play before
// drafting. It opens the YouTube results page for "<name> tennis highlights" — name-
// based, so it works for EVERY player in the pool with zero per-player data to maintain
// (no video IDs to curate or keep from going stale). encodeURIComponent handles spaces,
// hyphens, apostrophes and any accented characters safely.
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} tennis highlights`)}`;
}
