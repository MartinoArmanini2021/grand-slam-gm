// send-notifications, the logic. Plain TypeScript with the database and the mail provider passed in,
// so vitest runs it with fakes and index.ts runs it in Deno.
//   · who is due what comes from public.notification_candidates() (2026-10-20_notifications.sql);
//   · each email is CLAIMED first (claim_notification: insert … on conflict do nothing), so two runs
//     at once send it once; a failed send is marked failed and never retried;
//   · app_config notify_mode decides: 'off' (the SQL returns nobody), 'dry_run' (claim as dry_run,
//     send nothing), 'live' (send). Without RESEND_API_KEY, 'live' behaves as 'dry_run'.
// Emails are short, plain and in the manager's language (en / it).
import { unsubToken } from '../_shared/unsubToken.ts';

export type Kind = 'draft_open' | 'draft_lock' | 'market_open' | 'market_lock';

export type Candidate = {
  user_id: string;
  email: string;
  locale: string;
  kind: Kind;
  tournament_id: string;
  round: string;
  locks_at: string;
  players_out: string[];
  empty_slots: number;
  transfers_left: number;
  team_name: string | null;
};

export type NotifyDb = {
  mode: () => Promise<'off' | 'dry_run' | 'live'>;
  candidates: () => Promise<Candidate[]>;
  claim: (c: Candidate, dryRun: boolean) => Promise<boolean>;
  failed: (c: Candidate, detail: string) => Promise<void>;
};

export type Email = { to: string; subject: string; html: string; text: string; headers: Record<string, string> };
export type Send = (email: Email) => Promise<void>;

export type Config = {
  apiKey: string | undefined;
  from: string;
  /** the app, e.g. https://grandslamgm.com */
  appUrl: string;
  /** the functions base URL, for the one-click List-Unsubscribe header */
  functionsUrl: string;
  secret: string;
};

/** Tournament names as managers know them. An id not listed is shown tidied ("paris_2026" → "Paris 2026"). */
const TOURNAMENTS: Record<string, { en: string; it: string }> = {
  paris_2026: { en: 'Paris Masters', it: 'Masters di Parigi' },
  shanghai_2026: { en: 'Shanghai Masters', it: 'Masters di Shanghai' },
  usopen_2026: { en: 'US Open', it: 'US Open' },
  ao_2027: { en: 'Australian Open', it: 'Australian Open' },
};
const tidy = (id: string) =>
  id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ROUND = {
  en: { R128: 'first round', R64: 'second round', R32: 'third round', R16: 'round of 16', QF: 'quarter-finals', SF: 'semi-finals', F: 'final' },
  it: { R128: 'primo turno', R64: 'secondo turno', R32: 'terzo turno', R16: 'ottavi', QF: 'quarti', SF: 'semifinali', F: 'finale' },
} as const;

type Lang = 'en' | 'it';
type Vars = Record<string, string | number>;

const COPY: Record<Lang, Record<Kind, { subject: string; lines: string[]; button: string }> & {
  footer: string; hello: string; when: string;
}> = {
  en: {
    hello: 'Hi {team},',
    when: '{time} Rome time, {day}',
    footer: "You get these because you play Grand Slam GM. Turn them off: {unsub}",
    draft_open: {
      subject: '{event}: the draw is out, pick your squad',
      lines: ['The {event} draw is out and the draft is open.', 'Pick 10 players under $200M. It takes about 10 minutes.', 'The draft locks at {when}.'],
      button: 'Pick my squad',
    },
    draft_lock: {
      subject: '{event}: the draft locks in 2 hours',
      lines: ["You haven't picked a {event} squad yet.", 'The draft locks at {when}. After that you can only watch.'],
      button: 'Pick my squad',
    },
    market_open: {
      subject: 'Market open: {outline}',
      lines: ['The market for the {round} is open.', '{outline}.', 'You have {transfers} left. It locks at {when}.'],
      button: 'Open the market',
    },
    market_lock: {
      subject: 'Market locks in 2 hours: {outline}',
      lines: ['The market for the {round} locks at {when}.', '{outline}.', 'You have {transfers} left.'],
      button: 'Open the market',
    },
  },
  it: {
    hello: 'Ciao {team},',
    when: 'alle {time} ora italiana, {day}',
    footer: 'Ricevi queste email perché giochi a Grand Slam GM. Per disattivarle: {unsub}',
    draft_open: {
      subject: '{event}: il tabellone è uscito, scegli la squadra',
      lines: ['{event}: il tabellone è uscito e il draft è aperto.', 'Scegli 10 giocatori con $200M. Ci vogliono circa 10 minuti.', 'Il draft chiude {when}.'],
      button: 'Scegli la squadra',
    },
    draft_lock: {
      subject: '{event}: il draft chiude tra 2 ore',
      lines: ['Non hai ancora scelto la squadra per il torneo ({event}).', 'Il draft chiude {when}. Dopo potrai solo guardare.'],
      button: 'Scegli la squadra',
    },
    market_open: {
      subject: 'Mercato aperto: {outline}',
      lines: ['Il mercato per {round} è aperto.', '{outline}.', 'Ti restano {transfers}. Chiude {when}.'],
      button: 'Apri il mercato',
    },
    market_lock: {
      subject: 'Il mercato chiude tra 2 ore: {outline}',
      lines: ['Il mercato per {round} chiude {when}.', '{outline}.', 'Ti restano {transfers}.'],
      button: 'Apri il mercato',
    },
  },
};

const fill = (s: string, v: Vars) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "Sinner is out" / "Sinner and Fritz are out" / "2 players are out and 1 slot is empty". */
export function outline(lang: Lang, out: string[], empty: number): string {
  const surname = (n: string) => n.split(' ').slice(-1)[0];
  const names = out.map(surname);
  const join = (xs: string[]) =>
    xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${lang === 'it' ? 'e' : 'and'} ${xs[xs.length - 1]}`;
  const parts: string[] = [];
  if (names.length > 0 && names.length <= 3) {
    parts.push(lang === 'it' ? `${join(names)} ${names.length === 1 ? 'è fuori' : 'sono fuori'}` : `${join(names)} ${names.length === 1 ? 'is' : 'are'} out`);
  } else if (names.length > 3) {
    parts.push(lang === 'it' ? `${names.length} tuoi giocatori sono fuori` : `${names.length} of your players are out`);
  }
  if (empty > 0) {
    parts.push(
      lang === 'it'
        ? `${empty === 1 ? 'hai 1 posto libero' : `hai ${empty} posti liberi`}`
        : `${empty === 1 ? 'you have 1 empty slot' : `you have ${empty} empty slots`}`,
    );
  }
  const s = parts.join(lang === 'it' ? ' e ' : ' and ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function whenText(lang: Lang, iso: string): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const day = new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-GB', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return fill(COPY[lang].when, { time, day });
}

/** The email for one manager and one reason. */
export async function renderEmail(c: Candidate, cfg: Config): Promise<Email> {
  const lang: Lang = c.locale === 'it' ? 'it' : 'en';
  const copy = COPY[lang][c.kind];
  const t = TOURNAMENTS[c.tournament_id];
  const transfersLeft = c.transfers_left;
  const vars: Vars = {
    event: t ? t[lang] : tidy(c.tournament_id),
    round: (ROUND[lang] as Record<string, string>)[c.round] ?? c.round,
    when: whenText(lang, c.locks_at),
    outline: outline(lang, c.players_out ?? [], c.empty_slots ?? 0),
    transfers:
      lang === 'it'
        ? transfersLeft === 1 ? '1 cambio' : `${transfersLeft} cambi`
        : transfersLeft === 1 ? '1 transfer' : `${transfersLeft} transfers`,
    team: c.team_name?.trim() || (lang === 'it' ? 'manager' : 'manager'),
  };
  const app = cfg.appUrl.replace(/\/+$/, '');
  const target = c.kind.startsWith('draft') ? `${app}/setup` : `${app}/market`;
  const token = await unsubToken(cfg.secret, c.user_id);
  const q = `u=${encodeURIComponent(c.user_id)}&t=${encodeURIComponent(token)}`;
  const unsubPage = `${app}/unsubscribe?${q}`;
  const oneClick = `${cfg.functionsUrl.replace(/\/+$/, '')}/notify-unsubscribe?${q}`;
  const subject = fill(copy.subject, vars);
  const hello = fill(COPY[lang].hello, vars);
  const lines = copy.lines.map((l) => fill(l, vars));
  const button = copy.button;
  const footerText = fill(COPY[lang].footer, { unsub: unsubPage });

  const text = [hello, '', ...lines, '', `${button}: ${target}`, '', footerText].join('\n');
  const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;
  const html = `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;max-width:560px;overflow-wrap:anywhere;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;color:#0A1F44;background:#fff">
${p(esc(hello))}
${lines.map((l) => p(esc(l))).join('\n')}
<p style="margin:20px 0"><a href="${esc(target)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0A1F44;color:#fff;font-weight:700;text-decoration:none">${esc(button)}</a></p>
<p style="margin:24px 0 0;font-size:13px;color:#4A5872;word-break:break-all">${esc(fill(COPY[lang].footer, { unsub: '' }))}<a href="${esc(unsubPage)}" style="color:#4A5872">${esc(unsubPage)}</a></p>
</body>
</html>
`;
  return {
    to: c.email,
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

export type Summary = { mode: string; due: number; sent: number; failed: number; dry_run: number; skipped: number };

/** One run: every due email claimed once, then sent (or, in a dry run, only recorded). */
export async function runNotifications(db: NotifyDb, cfg: Config, send: Send): Promise<Summary> {
  const mode = await db.mode();
  const out: Summary = { mode, due: 0, sent: 0, failed: 0, dry_run: 0, skipped: 0 };
  if (mode === 'off') return out;
  const due = await db.candidates();
  out.due = due.length;
  const dry = mode !== 'live' || !cfg.apiKey;
  if (!dry && (!cfg.from || !cfg.appUrl || !cfg.secret)) {
    throw new Error('NOTIFY_FROM, PUBLIC_APP_URL and NOTIFY_UNSUB_SECRET must all be set to send');
  }
  for (const c of due) {
    if (!(await db.claim(c, dry))) {
      out.skipped++;
      continue;
    }
    if (dry) {
      out.dry_run++;
      continue;
    }
    try {
      await send(await renderEmail(c, cfg));
      out.sent++;
    } catch (e) {
      out.failed++;
      await db.failed(c, e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}

/** Resend's REST API (the provider Call the Crown already uses for mail.grandslamgm.com). */
export function resendSender(apiKey: string, from: string): Send {
  return async (email) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text, headers: email.headers }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}
