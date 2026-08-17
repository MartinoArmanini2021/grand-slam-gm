// THROWAWAY UX text-audit script. Extracts user-facing string literals + JSX text
// from src/pages/*.tsx and src/components/*.tsx. Delete after use.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/Users/marti/tennis-fantasy/src';
const DIRS = ['pages', 'components'];
const OUT = process.argv[2] || 'C:/Users/marti/AppData/Local/Temp/claude/C--Users-marti/e60095ae-56e5-418c-a0cf-334d83326896/scratchpad';

// ---------------------------------------------------------------- lexer
// Walks the source once, producing (a) every string / template literal with the
// code that precedes it, and (b) a "masked" copy of the source where comments and
// string CONTENTS are blanked to spaces, so JSX text can be found without
// tripping over < > { } that live inside strings.
function lex(src) {
  const strings = [];
  const mask = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (mask[k] !== '\n') mask[k] = ' '; };
  const modes = [{ k: 'code', depth: 0 }];
  let prevSig = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const top = modes[modes.length - 1];
    const c = src[i];

    if (top.k === 'tpl') {
      if (c === '\\') { top.buf += '\u0000'; i += 2; continue; }
      if (c === '`') {
        blank(top.start + 1, i);
        strings.push({ start: top.start, value: top.buf, kind: 'tpl' });
        modes.pop(); prevSig = '`'; i++; continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        top.buf += '\u0001';                 // interpolation placeholder
        modes.push({ k: 'code', depth: 0 });
        i += 2; continue;
      }
      top.buf += c; i++; continue;
    }

    // ---- code mode ----
    if (c === '/' && src[i + 1] === '/') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      blank(i, j); i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2); j = j === -1 ? n : j + 2;
      blank(i, j); i = j; continue;
    }
    if (c === '/' && /[=(,:[!&|?{};+\n]/.test(prevSig || '\n')) {
      // regex literal
      let j = i + 1, cls = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') cls = true;
        else if (d === ']') cls = false;
        else if (d === '/' && !cls) break;
        else if (d === '\n') break;
        j++;
      }
      blank(i, Math.min(j + 1, n)); i = j + 1; prevSig = '/'; continue;
    }
    if (c === "'" || c === '"') {
      // A quote only OPENS a string where a value may begin. Otherwise it is an
      // apostrophe inside JSX text ("That's it", "don't") — treat it as a plain char,
      // or the mask would blank out real copy and invent phantom strings.
      const before = src.slice(Math.max(0, i - 16), i);
      const valuePos = /[=(,:[{?!&|+\-*%;~^]\s*$/.test(before)
        || /=>\s*$/.test(before)
        || /^\s*$/.test(before)
        || /\b(from|return|typeof|case|in|of|import|new|delete|await|yield|extends|as|do|else|throw)\s+$/.test(before);
      if (!valuePos) { prevSig = c; i++; continue; }
      const q = c; let j = i + 1; let val = '';
      while (j < n) {
        const d = src[j];
        if (d === '\\') { val += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; }
        if (d === q) break;
        if (d === '\n') break;
        val += d; j++;
      }
      blank(i + 1, j);
      strings.push({ start: i, value: val, kind: 'str' });
      i = j + 1; prevSig = q; continue;
    }
    if (c === '`') { modes.push({ k: 'tpl', start: i, buf: '' }); i++; continue; }
    if (c === '{') { top.depth++; i++; prevSig = c; continue; }
    if (c === '}') {
      if (top.depth === 0 && modes.length > 1) { modes.pop(); i++; prevSig = '}'; continue; }
      top.depth--; i++; prevSig = c; continue;
    }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return { strings, masked: mask.join('') };
}

// ------------------------------------------------- classification tables
const CSS_PROPS = new Set(`background backgroundColor backgroundImage backgroundSize backgroundPosition backgroundRepeat
color border borderTop borderBottom borderLeft borderRight borderRadius borderColor borderStyle borderWidth boxShadow
padding paddingTop paddingBottom paddingLeft paddingRight margin marginTop marginBottom marginLeft marginRight
display position top left right bottom width height minWidth minHeight maxWidth maxHeight overflow overflowX overflowY
flex flexDirection flexWrap alignItems alignSelf justifyContent justifyItems gap rowGap columnGap grid gridTemplateColumns
gridTemplateRows gridColumn gridRow font fontFamily fontSize fontWeight fontStyle lineHeight letterSpacing textAlign
textTransform textDecoration textShadow whiteSpace wordBreak overflowWrap opacity transform transformOrigin transition
animation filter backdropFilter cursor pointerEvents userSelect visibility zIndex boxSizing objectFit objectPosition
outline outlineColor fill stroke strokeWidth strokeLinecap strokeLinejoin content float clear listStyle verticalAlign
WebkitOverflowScrolling WebkitBackgroundClip WebkitTextFillColor WebkitLineClamp webkitLineClamp inset flexShrink flexGrow
flexBasis aspectRatio mixBlendMode willChange textOverflow scrollBehavior touchAction appearance resize order`.split(/\s+/));

const NON_TEXT_ATTRS = new Set(`className class key id htmlFor href src srcSet type role name value viewBox xmlns
preserveAspectRatio d points transform fill stroke pathLength offset stopColor gradientUnits x1 x2 y1 y2 cx cy r rx ry
x y dx dy width height style to path method action target rel as loading decoding crossOrigin referrerPolicy
autoComplete inputMode enterKeyHint pattern accept lang dir slot part is form list step min max
event table column bucket channel topic scheme protocol variant tone size icon color bg accent`.split(/\s+/));

const TEXT_KEYS = new Set(`title body label text message msg placeholder alt tooltip desc description cta hint note
heading subtitle sub blurb caption copy line lines summary question answer headline tagline prompt error errorMsg
help helpText confirm confirmText ok cancel emptyText emptyState footer subhead lede kicker`.split(/\s+/));

const CSS_VALUE_RE = /^(#[0-9a-fA-F]{3,8}|-?[\d.]+(px|rem|em|%|vh|vw|dvh|svh|ch|s|ms|fr|deg)?|(var\(--|rgba?\(|hsla?\(|linear-gradient|radial-gradient|conic-gradient|blur\(|drop-shadow|translate|scale|rotate|calc\(|url\(|inset ).*)$/;
const CSS_KEYWORDS = new Set(`none auto inherit initial unset flex block inline inline-block inline-flex grid contents
center start end stretch baseline space-between space-around space-evenly flex-start flex-end absolute relative fixed
sticky static pointer default grab grabbing text move not-allowed uppercase lowercase capitalize nowrap pre pre-wrap
break-word break-all hidden visible scroll overlay clip solid dashed dotted double column row column-reverse row-reverse
wrap nowrap border-box content-box cover contain fill touch bold normal italic 600 700 800 900 currentColor transparent
ellipsis middle top bottom left right both round butt square smooth manipulation ease ease-in ease-out linear infinite
alternate forwards backwards spring 100% 50% 0 1 2`.split(/\s+/));

const CODEY_RE = /^[a-z0-9]+([_.:\-\/][a-z0-9]+)+$/i;         // snake_case / dotted / kebab ids
const PATHY_RE = /^(\.{1,2}\/|\/|https?:|data:|mailto:|blob:|#|@)/;

function precedingKey(ctx) {
  const m = ctx.match(/([A-Za-z_$][\w$-]*)\s*[:=]\s*\{?\s*$/);
  return m ? m[1] : null;
}

function classifyString(value, ctx, file) {
  const t = value.replace(/\u0001/g, ' ').trim();
  if (!t) return null;
  if (!/[A-Za-z]/.test(t)) return null;
  if (PATHY_RE.test(t)) return null;
  if (CSS_VALUE_RE.test(t)) return null;

  const key = precedingKey(ctx);
  if (key && TEXT_KEYS.has(key)) return t;                     // definitely copy
  if (key && (CSS_PROPS.has(key) || NON_TEXT_ATTRS.has(key))) return null;
  if (/\b(import|from|require|createElement|getElementById|querySelector(All)?|setItem|getItem|removeItem|capture|track|identify|addEventListener|removeEventListener|matchMedia|from|rpc|eq|select|insert|upsert|update|delete|order|channel|classList\.\w+)\s*\(?\s*$/.test(ctx)) return null;
  if (/(className|class)\s*=\s*\{?\s*$/.test(ctx)) return null;
  if (/\?\s*$|:\s*$/.test(ctx) && CSS_KEYWORDS.has(t)) return null;
  if (CSS_KEYWORDS.has(t.toLowerCase())) return null;
  if (CODEY_RE.test(t) && !/\s/.test(t)) return null;
  // tailwind class soup: >=3 lowercase tokens where at least 2 carry a tailwind marker (- : [)
  if (/\s/.test(t) && /^[a-z0-9\s:\[\]\/\.\-%#()]+$/.test(t) && !/[A-Z]/.test(t) && !/[.,!?'’]/.test(t)) {
    const tok = t.split(/\s+/);
    if (tok.length >= 3 && tok.filter(w => /[-:\[]/.test(w)).length >= 2) return null;
  }
  if (/^[a-z-]+$/.test(t) && t.length <= 3) return null;
  return t;
}

// --------------------------------------------------------- JSX text nodes
// Is the `>` at index i the close of a real JSX tag? (strings/comments are already
// masked, so attribute values can't fake a `<`.)
function isTagClose(masked, i) {
  const lt = masked.lastIndexOf('<', i);
  if (lt === -1) return false;
  const inner = masked.slice(lt + 1, i);
  if (/[<>;`]/.test(inner)) return false;
  return /^\/?[A-Za-z][\w.$:-]*(\s[\s\S]*?)?\/?$/.test(inner);
}

const CODE_SMELL = [
  /=>|===|!==|&&|\|\||\$\{/,                 // operators
  /=/,                                        // assignment / JSX attribute
  /[A-Za-z_$][\w$]*\(/,                       // function call
  /\s\?\s/,                                   // ternary
  /[a-z][\w$]*\.[A-Za-z_$]/,                  // property access
  /\b(const|let|var|function|return|import|export|type|interface|typeof|await|async|null|undefined|className|style|onClick|props|useState|useMemo|useEffect)\b/,
];

function jsxText(masked, src, dropped) {
  const found = [];
  const delim = /[<>{}]/g;
  const marks = [];
  let m;
  while ((m = delim.exec(masked))) marks.push({ ch: m[0], i: m.index });
  for (let k = 0; k < marks.length - 1; k++) {
    const a = marks[k], b = marks[k + 1];
    if (!(a.ch === '>' || a.ch === '}')) continue;
    if (!(b.ch === '<' || b.ch === '{')) continue;
    if (a.ch === '>' && masked[a.i - 1] === '=') continue;      // arrow fn
    if (a.ch === '>' && !isTagClose(masked, a.i)) continue;     // not a tag close
    // slice from `masked` so code comments (already blanked) can never leak in as copy
    const t = masked.slice(a.i + 1, b.i)
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&rarr;/g, '→')
      .replace(/&mdash;/g, '—').replace(/&times;/g, '×').replace(/&middot;/g, '·')
      .replace(/\s+/g, ' ').trim();
    if (!t || !/[A-Za-z]/.test(t)) continue;
    // a fragment that continues a sentence after {interpolation} may open on punctuation
    const head = t.replace(/^[)\]}:;,.?\s]+/, '');
    if (!head || !/[A-Za-z]/.test(head)) continue;
    if (CODE_SMELL.some(re => re.test(head))) { dropped.push(t); continue; }
    found.push(t);
  }
  return found;
}

// ------------------------------------------------------------------ run
const words = s => s.replace(/\u0001/g, ' ').split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length;

const rows = [];
const rejects = [];
const jsxDropped = [];
for (const dir of DIRS) {
  const d = path.join(ROOT, dir);
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.tsx')).sort()) {
    const p = path.join(d, f);
    const src = fs.readFileSync(p, 'utf8');
    const { strings, masked } = lex(src);
    const items = [];
    for (const s of strings) {
      const ctx = src.slice(Math.max(0, s.start - 80), s.start);
      const keep = classifyString(s.value, ctx, f);
      if (keep) items.push(keep);
      else if (/[A-Za-z]/.test(s.value) && s.value.trim().length > 12)
        rejects.push(`${dir}/${f} :: ${JSON.stringify(s.value.slice(0, 120))} <<CTX ${JSON.stringify(ctx.slice(-45))}`);
    }
    const dropped = [];
    for (const t of jsxText(masked, src, dropped)) items.push(t);
    for (const t of dropped) jsxDropped.push(`${dir}/${f} :: ${JSON.stringify(t.slice(0, 140))}`);

    const distinct = [...new Set(items.map(x => x.replace(/\u0001/g, '{…}')))];
    const totalWords = distinct.reduce((a, s) => a + words(s), 0);
    const longest = [...distinct].sort((a, b) => words(b) - words(a) || b.length - a.length).slice(0, 15);
    rows.push({ file: `src/${dir}/${f}`, strings: distinct.length, words: totalWords, longest, all: distinct });
  }
}

rows.sort((a, b) => b.words - a.words);
const grand = rows.reduce((a, r) => a + r.words, 0);
const grandStr = rows.reduce((a, r) => a + r.strings, 0);

let rep = `GRAND TOTAL: ${grandStr} distinct user-facing strings, ${grand} words\n\n`;
rep += `RANK  WORDS   STRINGS  %TOT  CUM%   FILE\n`;
let cum = 0;
rows.forEach((r, i) => {
  cum += r.words;
  rep += `${String(i + 1).padStart(4)}  ${String(r.words).padStart(5)}   ${String(r.strings).padStart(7)}  ${(r.words / grand * 100).toFixed(1).padStart(4)}  ${(cum / grand * 100).toFixed(1).padStart(5)}   ${r.file}\n`;
});
rep += `\n\n================ PER-FILE: 15 LONGEST STRINGS ================\n`;
for (const r of rows) {
  rep += `\n\n### ${r.file}  —  ${r.strings} strings, ${r.words} words\n`;
  r.longest.forEach((s, i) => { rep += `${String(i + 1).padStart(2)}. [${String(words(s)).padStart(3)}w] ${JSON.stringify(s)}\n`; });
}
fs.writeFileSync(path.join(OUT, 'uxcount.txt'), rep, 'utf8');
fs.writeFileSync(path.join(OUT, 'uxcount.json'), JSON.stringify(rows, null, 1), 'utf8');
fs.writeFileSync(path.join(OUT, 'uxrejects.txt'), rejects.join('\n'), 'utf8');
fs.writeFileSync(path.join(OUT, 'uxjsxdropped.txt'), jsxDropped.join('\n'), 'utf8');
console.log(rep.slice(0, 4000));
console.log('\nrejected-but-longish sample count:', rejects.length);
