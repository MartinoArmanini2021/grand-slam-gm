// ── Invite / share loop ──────────────────────────────────────────────────────
// The viral loop: a private-league owner shares a LINK (not a bare 6-char code), the
// friend taps it, lands on the app, and is auto-joined once signed in (see the
// `?join=` handler in App.tsx). Uses the native share sheet on mobile — where these
// leagues actually get shared (iMessage/WhatsApp) — and falls back to copying the link.
import { track } from './analytics';
import { toast } from '../store/toastStore';
import { TOURNAMENT } from './tournamentConfig';

export const inviteUrl = (code: string) => `${window.location.origin}/?join=${encodeURIComponent(code)}`;

export function inviteMessage(leagueName: string, code: string): string {
  return `🎾 Join my Grand Slam GM league "${leagueName}" for the ${TOURNAMENT.name} — draft your fantasy squad and let's see who wins. ${inviteUrl(code)}`;
}

// Share an invite: native share sheet when available, else copy the link to clipboard.
export async function shareInvite(leagueName: string, code: string): Promise<void> {
  const url = inviteUrl(code);
  const text = `🎾 Join my Grand Slam GM league "${leagueName}" for the ${TOURNAMENT.name} — draft your squad and let's see who wins.`;
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Grand Slam GM', text, url });
      track('invite_shared', { method: 'native' });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // user dismissed the share sheet
      // otherwise fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Invite link copied — paste it to your friends 🎾', 'good');
    track('invite_shared', { method: 'clipboard' });
  } catch {
    toast('Copy this invite link: ' + url, 'info');
  }
}
