// scripts/drawday.mjs: the draw-night order. --plan prints the steps without touching the network.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve(__dirname, '../../scripts/drawday.mjs');

describe('drawday --plan', () => {
  it('prints the ten steps that need his word, in order, and writes nothing', () => {
    const r = spawnSync(process.execPath, [script, 'paris_2026', '--plan'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const out = r.stdout;
    const order = [
      'Apply the prices',
      'Apply the lock times',
      'Feed: add the event',
      'Feed: deploy',
      'Feed: run once',
      'Switch the game to the event',
      "Stamp the first round's lock time",
      'Remove the old Shanghai lock times',
      'App: default event',
      'Checks',
    ];
    let at = -1;
    for (const step of order) {
      const i = out.indexOf(step);
      expect(i, step).toBeGreaterThan(at);
      at = i;
    }
    expect(out).toContain("set value = 'paris_2026'");
    expect(out).toContain('2026-10-19_paris_2026_round_plan.sql');
  });

  it('refuses an unknown event', () => {
    const r = spawnSync(process.execPath, [script, 'nowhere_2099', '--plan'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
