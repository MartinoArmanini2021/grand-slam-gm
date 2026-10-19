// scripts/round-plan.mjs: the round plan from a schedule in local time. The strongest check is that it
// rebuilds Shanghai's hand-converted plan (supabase/2026-09-24_shanghai_round_plan.sql, applied and
// correct) exactly, from local times alone.
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script, no types
import { pinSql, planRows, planSql, zonedToUtc } from '../../scripts/round-plan.mjs';
import shanghaiSql from '../../supabase/2026-09-24_shanghai_round_plan.sql?raw';
import parisSpec from '../../scripts/schedules/paris_2026.json';

type Row = { round: string; slots: number; first: Date; prev_round: string | null; prev_slots: number | null };

describe('round-plan', () => {
  it('converts local time to UTC across daylight saving', () => {
    // Paris leaves summer time on Sun 25 Oct 2026: 11:00 is 09:00Z before, 10:00Z after.
    expect(zonedToUtc('2026-10-24 11:00', 'Europe/Paris').toISOString()).toBe('2026-10-24T09:00:00.000Z');
    expect(zonedToUtc('2026-11-03 11:00', 'Europe/Paris').toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect(zonedToUtc('2027-01-17 11:00', 'Australia/Melbourne').toISOString()).toBe('2027-01-17T00:00:00.000Z');
    expect(() => zonedToUtc('2026-03-29 02:30', 'Europe/Paris')).toThrow(/DST gap/);
  });

  it('rebuilds the applied Shanghai plan exactly from local times', () => {
    const rows: Row[] = planRows('shanghai_2026', {
      tz: 'Asia/Shanghai',
      rounds: [
        { round: 'R64', local: '2026-10-09 11:00' },
        { round: 'R32', local: '2026-10-11 11:00' },
        { round: 'R16', local: '2026-10-13 11:00' },
        { round: 'QF', local: '2026-10-15 11:00' },
        { round: 'SF', local: '2026-10-17 11:00' },
        { round: 'F', local: '2026-10-18 14:00' },
      ],
    });
    const applied = [...shanghaiSql.matchAll(/\('shanghai_2026', '(\w+)', +(\d+), '([^']+)', (?:'(\w+)'|null), +(\d+|null)/g)].map((m) => ({
      round: m[1], slots: Number(m[2]), first: m[3], prev_round: m[4] ?? null, prev_slots: m[5] === 'null' ? null : Number(m[5]),
    }));
    expect(applied).toHaveLength(6);
    expect(rows.map((r) => ({ round: r.round, slots: r.slots, first: r.first.toISOString().replace('.000', ''), prev_round: r.prev_round, prev_slots: r.prev_slots }))).toEqual(applied);
  });

  it('Paris: all six rounds score (decided 20 Oct); R64 has 24 matches, so R32 waits for 24 winners', () => {
    const rows: Row[] = planRows('paris_2026', parisSpec);
    expect(rows.map((r) => r.round)).toEqual(['R64', 'R32', 'R16', 'QF', 'SF', 'F']);
    expect(rows[0]!.prev_round).toBeNull();
    expect(rows.map((r) => r.slots)).toEqual([24, 16, 8, 4, 2, 1]);
    expect(rows.map((r) => r.prev_slots)).toEqual([null, 24, 16, 8, 4, 2]);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.first > rows[i - 1]!.first).toBe(true);
    const sql: string = planSql('paris_2026', parisSpec, '2026-10-20');
    expect(sql).toContain("('paris_2026', 'R64', 24, '2026-11-02T10:00:00Z', null, null,");
    expect(sql).toContain("('paris_2026', 'R32', 16, '2026-11-04T10:00:00Z', 'R64', 24,");
    expect(sql).toContain('-- ROLLBACK');
  });

  it('refuses a round with more matches than its name allows', () => {
    expect(() =>
      planRows('x', { tz: 'Europe/Paris', rounds: [{ round: 'SF', slots: 3, local: '2026-11-07 11:00' }, { round: 'F', local: '2026-11-08 11:00' }] }),
    ).toThrow(/slots must be 1–2/);
  });

  it('refuses a schedule out of order, with a gap, or without the final', () => {
    const bad = (rounds: { round: string; local: string }[]) => () => planRows('x', { tz: 'Europe/Paris', rounds });
    expect(bad([{ round: 'R16', local: '2026-11-05 11:00' }, { round: 'SF', local: '2026-11-07 11:00' }, { round: 'F', local: '2026-11-08 11:00' }])).toThrow(/must come right after/);
    expect(bad([{ round: 'SF', local: '2026-11-07 11:00' }, { round: 'F', local: '2026-11-06 11:00' }])).toThrow(/is not after/);
    expect(bad([{ round: 'QF', local: '2026-11-06 11:00' }, { round: 'SF', local: '2026-11-07 11:00' }])).toThrow(/end with the final/);
  });

  it('a pin never re-times a round that has begun', () => {
    const sql: string = pinSql('paris_2026', parisSpec, 'R16', '2026-11-05 12:30', 'order of play');
    expect(sql).toContain("first_ball = '2026-11-05T11:30:00Z'");
    expect(sql).toMatch(/and not exists \(select 1 from public\.matches m/);
  });
});
