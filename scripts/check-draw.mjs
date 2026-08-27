// ── Has the draw actually been published? ────────────────────────────────────────────────────────
//
//   node scripts/check-draw.mjs ["2026 US Open – Men's singles"]
//
// Job 8 cannot start until the tournament publishes its bracket, so this answers one question
// honestly: are the round-one slots FILLED?
//
// Two traps, both of which bit me on 2026-08-26 and produced a confident "DRAW IS PUBLISHED"
// on a page holding 128 empty slots:
//
//   1. Counting `{{flagicon|XXX}} [[Name]]` across the whole page counts the SEED LIST, the
//      withdrawals table and the qualifying section — none of which are the draw. Read the
//      `RD1-team01..NN` parameters and nothing else.
//   2. Capturing a slot with [^\n|]* stops at the `|` inside {{flagicon|USA}}, so every filled
//      slot reads as the string "{{flagicon". Capture to END OF LINE.
//
// READ-ONLY.

const API = 'https://en.wikipedia.org/w/api.php';
const TITLE = process.argv[2] ?? "2026 US Open – Men's singles";

const res = await fetch(
  `${API}?action=parse&page=${encodeURIComponent(TITLE)}&prop=wikitext&formatversion=2&format=json&origin=*`,
);
if (!res.ok) {
  console.log(`\n  ${TITLE}\n  page fetch failed: ${res.status} — retry, do NOT read this as "no draw"\n`);
  process.exit(1);
}
const w = (await res.json())?.parse?.wikitext ?? '';
if (!w) {
  console.log(`\n  ${TITLE}\n  no wikitext — page may not exist yet\n`);
  process.exit(1);
}

const brackets = (w.match(/\{\{\s*[0-9]+TeamBracket/gi) || []).length;
const slots = [...w.matchAll(/\|\s*RD1-team(\d{2})\s*=([^\n]*)/g)].map((m) => m[2].trim());

const strip = (s) => s
  .replace(/\{\{flagicon\|[A-Za-z]{3}\}\}/gi, '')
  .replace(/\{\{small\|[^}]*\}\}/gi, '')
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  .replace(/\[\[|\]\]/g, '')
  .replace(/'''/g, '')
  .trim();

const filled = slots.filter((s) => strip(s) !== '');
const quals = slots.filter((s) => /qualifier/i.test(s));
// A draw is COMPLETE or it is useless. The original bar was 50%, which called a
// half-typed page "published" at 65/128 on 2026-08-27 — and a field built from that
// would have been missing sixty-three players with nothing to flag it. Wikipedia fills
// a Slam draw in one long sitting, so allow only a couple of stragglers.
const empty = slots.length - filled.length;
const ready = slots.length >= 32 && empty <= 2;

console.log(`\n  ${TITLE}`);
console.log(`    bracket templates : ${brackets}`);
console.log(`    round-one slots   : ${slots.length}`);
console.log(`    filled            : ${filled.length}`);
console.log(`    empty             : ${slots.length - filled.length}`);
console.log(`    marked "Qualifier": ${quals.length}   ← how many placeholders Job 8 must create`);
if (filled.length) console.log(`    sample            : ${filled.slice(0, 3).map(strip).join(' · ')}`);
console.log(`\n    ${ready ? '✅  DRAW IS PUBLISHED — Job 8 can start' : '⏳  still a skeleton — the draw is not out'}\n`);
// Set the code and let the event loop drain. process.exit() here races Node's teardown of the
// still-closing fetch handle and dies with a libuv assertion (exit 127 on Windows), which would
// have made this watch unreadable to the scheduled task that depends on it.
process.exitCode = ready ? 0 : 3;
