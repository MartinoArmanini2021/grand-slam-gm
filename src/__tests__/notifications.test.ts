// Market emails (growth plan item 1): the sender's rules and its copy. The SQL side is tested by
// supabase/notifications_tests.sql; this file covers notify.ts and the unsubscribe handler.
import { describe, expect, it } from 'vitest';
import {
  outline,
  renderEmail,
  runNotifications,
  type Candidate,
  type Config,
  type NotifyDb,
} from '../../supabase/functions/send-notifications/notify.ts';
import { handleUnsubscribe } from '../../supabase/functions/notify-unsubscribe/handler.ts';
import { checkUnsubToken, unsubToken } from '../../supabase/functions/_shared/unsubToken.ts';

const cfg: Config = {
  apiKey: 'key',
  from: 'Grand Slam GM <hello@mail.grandslamgm.com>',
  appUrl: 'https://grandslamgm.com',
  functionsUrl: 'https://x.supabase.co/functions/v1',
  secret: 's3cret',
};
const base: Candidate = {
  user_id: '00000000-0000-0000-0000-00000000000a',
  email: 'a@example.test',
  locale: 'en',
  kind: 'market_open',
  tournament_id: 'paris_2026',
  round: 'R16',
  locks_at: '2026-11-05T10:00:00Z',
  players_out: ['Jannik Sinner'],
  empty_slots: 0,
  transfers_left: 3,
  team_name: 'Agass',
};

function fakeDb(mode: 'off' | 'dry_run' | 'live', due: Candidate[]) {
  const claimed = new Set<string>();
  const log: { kind: string; dry: boolean }[] = [];
  const failed: string[] = [];
  const db: NotifyDb = {
    mode: async () => mode,
    candidates: async () => due,
    claim: async (c, dry) => {
      const k = `${c.user_id}|${c.kind}|${c.round}`;
      if (claimed.has(k)) return false;
      claimed.add(k);
      log.push({ kind: c.kind, dry });
      return true;
    },
    failed: async (c, d) => void failed.push(`${c.email}: ${d}`),
  };
  return { db, log, failed };
}

describe('runNotifications', () => {
  it('off: reads nothing, sends nothing', async () => {
    const { db, log } = fakeDb('off', [base]);
    const sent: string[] = [];
    const s = await runNotifications(db, cfg, async (e) => void sent.push(e.to));
    expect(s).toMatchObject({ mode: 'off', due: 0, sent: 0 });
    expect(sent).toEqual([]);
    expect(log).toEqual([]);
  });

  it('dry_run: records every email, sends none, even with an API key', async () => {
    const { db, log } = fakeDb('dry_run', [base, { ...base, user_id: 'b', email: 'b@example.test' }]);
    const sent: string[] = [];
    const s = await runNotifications(db, cfg, async (e) => void sent.push(e.to));
    expect(s).toMatchObject({ due: 2, dry_run: 2, sent: 0 });
    expect(sent).toEqual([]);
    expect(log.every((l) => l.dry)).toBe(true);
  });

  it('live without an API key behaves as a dry run', async () => {
    const { db } = fakeDb('live', [base]);
    const sent: string[] = [];
    const s = await runNotifications(db, { ...cfg, apiKey: undefined }, async (e) => void sent.push(e.to));
    expect(s).toMatchObject({ dry_run: 1, sent: 0 });
    expect(sent).toEqual([]);
  });

  it('live: sends once per claim; a duplicate in the same run is skipped', async () => {
    const { db } = fakeDb('live', [base, base]);
    const sent: string[] = [];
    const s = await runNotifications(db, cfg, async (e) => void sent.push(e.to));
    expect(s).toMatchObject({ sent: 1, skipped: 1 });
    expect(sent).toEqual(['a@example.test']);
  });

  it('a failed send is recorded and does not stop the others', async () => {
    const { db, failed } = fakeDb('live', [base, { ...base, user_id: 'b', email: 'b@example.test' }]);
    let n = 0;
    const s = await runNotifications(db, cfg, async () => {
      if (n++ === 0) throw new Error('resend 500');
    });
    expect(s).toMatchObject({ sent: 1, failed: 1 });
    expect(failed[0]).toContain('resend 500');
  });
});

describe('the email', () => {
  it('names the knocked-out player, the transfers left and the lock time in Rome time', async () => {
    const e = await renderEmail(base, cfg);
    expect(e.subject).toBe('Market open: Sinner is out');
    expect(e.text).toContain('The market for the round of 16 is open.');
    expect(e.text).toContain('You have 3 transfers left. It locks at 11:00 Rome time, Thursday 5 November.');
    expect(e.text).toContain('Open the market: https://grandslamgm.com/market');
    expect(e.headers['List-Unsubscribe']).toMatch(/notify-unsubscribe\?u=/);
  });

  it('speaks Italian when the manager chose it', async () => {
    const e = await renderEmail({ ...base, locale: 'it', kind: 'market_lock', players_out: ['Jannik Sinner', 'Taylor Fritz'], transfers_left: 1 }, cfg);
    expect(e.subject).toBe('Il mercato chiude tra 2 ore: Sinner e Fritz sono fuori');
    expect(e.text).toContain('Il mercato per ottavi chiude alle 11:00 ora italiana, giovedì 5 novembre.');
    expect(e.text).toContain('Ti restano 1 cambio.');
  });

  it('draft emails point to the squad builder', async () => {
    const e = await renderEmail({ ...base, kind: 'draft_open', round: '', players_out: [] }, cfg);
    expect(e.subject).toBe('Paris Masters: the draw is out, pick your squad');
    expect(e.text).toContain('The Paris Masters draw is out and the draft is open.');
    expect(e.text).toContain('https://grandslamgm.com/setup');
  });

  it('escapes a team name in the HTML', async () => {
    const e = await renderEmail({ ...base, team_name: '<b>Bad</b>' }, cfg);
    expect(e.html).not.toContain('<b>Bad</b>');
    expect(e.html).toContain('&lt;b&gt;Bad&lt;/b&gt;');
  });

  it('outline handles many players and empty slots', () => {
    expect(outline('en', ['A B', 'C D', 'E F', 'G H'], 0)).toBe('4 of your players are out');
    expect(outline('en', [], 2)).toBe('You have 2 empty slots');
    expect(outline('it', ['Jannik Sinner'], 1)).toBe('Sinner è fuori e hai 1 posto libero');
  });
});

describe('unsubscribe', () => {
  const u = '00000000-0000-0000-0000-00000000000a';
  it('the token checks for its own user only', async () => {
    const t = await unsubToken('k', u);
    expect(await checkUnsubToken('k', u, t)).toBe(true);
    expect(await checkUnsubToken('k', '00000000-0000-0000-0000-00000000000b', t)).toBe(false);
    expect(await checkUnsubToken('other', u, t)).toBe(false);
  });

  it('GET never unsubscribes; POST with a good token does; a bad token is 403', async () => {
    const off: string[] = [];
    const deps = { secret: 'k', unsubscribe: async (id: string) => (off.push(id), true) };
    const t = await unsubToken('k', u);
    const url = `https://x/notify-unsubscribe?u=${u}&t=${t}`;
    expect((await handleUnsubscribe(new Request(url), deps)).status).toBe(405);
    expect(off).toEqual([]);
    expect((await handleUnsubscribe(new Request(url, { method: 'POST' }), deps)).status).toBe(200);
    expect(off).toEqual([u]);
    const bad = `https://x/notify-unsubscribe?u=${u}&t=nope`;
    expect((await handleUnsubscribe(new Request(bad, { method: 'POST' }), deps)).status).toBe(403);
  });
});
