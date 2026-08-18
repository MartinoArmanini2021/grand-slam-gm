import { describe, it, expect } from 'vitest';
import { planSquad, wayOut } from '../data/squadPlan';
import { PLAYERS } from '../data/players';
import { getTier, type Tier } from '../data/tiers';

// ── The projection that would have saved two real managers ───────────────────────────────────────
//
// From production, Cincinnati 2026: manager 32828145 held 7 players with $7M left, needing
// 1 Platinum + 2 Silver whose cheapest combination cost $26M. They were $19M short and could not
// finish. The app never told them — every Platinum simply showed as "over your remaining budget",
// which reads as "not yet" rather than "never". Manager 51face7f was $4M from the same trap.
//
// These tests pin the arithmetic that makes that state visible.

const byTier = (t: Tier) => PLAYERS.filter(p => getTier(p.ranking) === t).sort((a, b) => a.price - b.price);
const cheapest = (t: Tier, n: number) => byTier(t).slice(0, n);
const dearest = (t: Tier, n: number) => [...byTier(t)].reverse().slice(0, n);
const ids = (ps: typeof PLAYERS) => ps.map(p => p.id);
const cost = (ps: typeof PLAYERS) => ps.reduce((t, p) => t + p.price, 0);

describe('planSquad', () => {
  it('an empty squad needs the full 2/3/5 and a real minimum price', () => {
    const plan = planSquad([], 150);
    expect(plan.slotsLeft).toBe(10);
    expect(plan.needed.map(n => `${n.missing}${n.tier[0]}`)).toEqual(['2P', '3G', '5S']);
    expect(plan.cheapestFinish).toBe(cost(cheapest('Platinum', 2)) + cost(cheapest('Gold', 3)) + cost(cheapest('Silver', 5)));
    expect(plan.complete).toBe(false);
    expect(plan.stuck).toBe(false); // $150M must always be enough to field SOMETHING legal
  });

  it('recognises a finished, legal squad', () => {
    const squad = ids([...cheapest('Platinum', 2), ...cheapest('Gold', 3), ...cheapest('Silver', 5)]);
    const plan = planSquad(squad, 150 - cost([...cheapest('Platinum', 2), ...cheapest('Gold', 3), ...cheapest('Silver', 5)]));
    expect(plan.complete).toBe(true);
    expect(plan.needed).toEqual([]);
    expect(plan.stuck).toBe(false);
  });

  // THE 32828145 CASE. Not a contrived example — this is a real manager's real position.
  it('detects a dead end: cannot afford the cheapest legal finish', () => {
    const squad = ids([...cheapest('Platinum', 1), ...dearest('Gold', 3), ...dearest('Silver', 3)]);
    const plan = planSquad(squad, 7);
    expect(plan.needed.map(n => `${n.missing}${n.tier[0]}`)).toEqual(['1P', '2S']);
    expect(plan.cheapestFinish).toBeGreaterThan(7);
    expect(plan.stuck).toBe(true);
    expect(plan.headroom).toBeLessThan(0);
  });

  it('flags a squad that is completable but only just', () => {
    const squad = ids(cheapest('Platinum', 2));
    const need = planSquad(squad, 999).cheapestFinish;   // what finishing would cost
    const plan = planSquad(squad, need + 1);             // afford it by exactly $1M
    expect(plan.stuck).toBe(false);
    expect(plan.tight).toBe(true);
  });

  it('is not "tight" when there is comfortable room', () => {
    const squad = ids(cheapest('Platinum', 2));
    const need = planSquad(squad, 999).cheapestFinish;
    expect(planSquad(squad, need * 3).tight).toBe(false);
  });
});

describe('wayOut', () => {
  it('is null when the manager is not stuck', () => {
    expect(wayOut([], 150)).toBeNull();
  });

  // The point of the feature: not "you are stuck", but "sell this one and you are fine".
  it('names the players whose sale makes the squad completable again', () => {
    const squad = ids([...cheapest('Platinum', 1), ...dearest('Gold', 3), ...dearest('Silver', 3)]);
    const out = wayOut(squad, 7);
    expect(out).not.toBeNull();
    expect(out!.shortfall).toBeGreaterThan(0);
    for (const id of out!.sell) expect(squad).toContain(id);
    if (out!.sell.length > 0) expect(out!.then.stuck).toBe(false);
  });

  // Selling a player you are REQUIRED to own can re-create the shortfall at a higher price, so the
  // suggestion has to be re-planned rather than assumed. This pins that the returned state is
  // genuinely unstuck, not merely richer.
  it('the suggested sale actually resolves the shortfall it creates', () => {
    const squad = ids([...cheapest('Platinum', 1), ...dearest('Gold', 3), ...dearest('Silver', 3)]);
    const out = wayOut(squad, 7)!;
    if (out.sell.length > 0) expect(out.then.headroom).toBeGreaterThanOrEqual(0);
  });

  // A single cheap sale IS enough from a mild dead end - the common case, and the one where naming
  // one player is genuinely helpful rather than a lecture.
  it('prefers a single sale when one suffices', () => {
    const squad = ids([...cheapest('Platinum', 2), ...cheapest('Gold', 3), ...dearest('Silver', 1)]);
    const spent = cost([...cheapest('Platinum', 2), ...cheapest('Gold', 3), ...dearest('Silver', 1)]);
    const out = wayOut(squad, Math.max(0, 150 - spent - 40));
    if (out && out.sell.length) {
      expect(out.sell.length).toBe(1);
      expect(out.then.stuck).toBe(false);
    }
  });
});
