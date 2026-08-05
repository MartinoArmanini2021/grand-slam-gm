import { describe, it, expect } from 'vitest';
import parserSrc from '../data/drawParser.ts?raw';
import edgeSrc from '../../supabase/functions/ingest-draw/index.ts?raw';

// The ingest Edge Function (Deno) can't import src/data/drawParser.ts — the Supabase bundler
// can't resolve its extensionless, type-only cross-file imports — so the parser is INLINED into
// supabase/functions/ingest-draw/index.ts. That inlined copy is what SCORES the live tournament,
// so it must never drift from the parser the vitest suite validates. This guard fails the build
// if it does: edit the parser in drawParser.ts and you must mirror it into the Edge Function.
describe('ingest Edge Function inlines the canonical parser verbatim', () => {
  // Collapse away everything that is allowed to differ (comments, the `export` keyword, all
  // whitespace, and single-parameter arrow parens `(p) =>` vs `p =>`) so only LOGIC is compared.
  const canon = (s: string) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/export /g, '')
    .replace(/\s+/g, '')
    .replace(/\(([A-Za-z0-9_]+)\)=>/g, '$1=>');

  // The parser body starts at the first runtime symbol (after the type-only imports/header).
  const canonicalBody = canon(parserSrc.slice(parserSrc.indexOf('const matchKey')));

  it('contains the entire drawParser body, logic-for-logic', () => {
    expect(canon(edgeSrc)).toContain(canonicalBody);
  });
});
