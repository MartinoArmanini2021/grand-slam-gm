import { useState, useEffect } from 'react';
import { getAvatarUri } from '../data/playerAvatars';
import { photoUrlFor } from '../data/playerPool';
import { getPlayer } from '../data/players';
import { getTier, TIER_META } from '../data/tiers';

import type { MouseEvent } from 'react';

interface Props {
  playerId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean; // tier-coloured ring (default true)
  onClick?: (e: MouseEvent) => void; // e.g. open the player's profile
}

const SIZE = { sm: 32, md: 40, lg: 56, xl: 96 } as const;
const FONT = { sm: 11, md: 13, lg: 16, xl: 28 } as const;

// Avatar source order, each falling back automatically on a load error so a
// missing/blocked image never leaves a hole:
//   1. self-hosted /avatars/{id}.png (downloaded from ATP — see scripts/fetch-avatars.mjs)
//   2. the ATP hotlink (covers any id we haven't downloaded yet)
//   3. the illustrated icon, then an initials monogram.

export default function PlayerAvatar({ playerId, name, size = 'md', className = '', ring = true, onClick }: Props) {
  const px = SIZE[size];
  const [stage, setStage] = useState(0);
  // Reset the image-source fallback when the player changes on a reused instance
  // (e.g. a court slot keyed by index after a transfer), so a new player isn't
  // stuck on the previous one's exhausted/errored source.
  useEffect(() => { setStage(0); }, [playerId]);

  let ringColor = 'rgba(10,27,51,0.16)';
  try { ringColor = TIER_META[getTier(getPlayer(playerId).ranking)].color; } catch { /* unknown id */ }
  const ringStyle = ring
    ? { boxShadow: `0 0 0 2px ${ringColor}, 0 0 0 4px rgba(255,255,255,0.7)` } // matches the ZIP spec
    : { boxShadow: 'inset 0 0 0 1px rgba(10,27,51,0.14)' };
  const clickable = onClick ? { cursor: 'pointer' } : {};

  const photo = photoUrlFor(playerId); // ATP hotlink; null if the id isn't in the pool
  const sources = [
    ...(photo ? [`/avatars/${playerId}.png`, photo] : []), // self-hosted first, hotlink fallback
    getAvatarUri(playerId),                                 // illustrated icon (data URI)
  ].filter(Boolean) as string[];
  const src = sources[stage] ?? null; // exhausted → initials monogram

  if (src) {
    // Match the ZIP's avatar treatment exactly: the image sits inside a clipped
    // circle and is zoomed to a tight, uniform face crop (object-position 50% 22%,
    // scale 1.08) — the same framing as the design deliverable, so the app and the
    // spec are visually identical.
    return (
      <div
        className={className}
        onClick={onClick}
        style={{ width: px, height: px, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative', ...ringStyle, ...clickable }}
      >
        <img
          key={src}
          src={src}
          alt={name}
          onError={() => setStage(s => s + 1)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block',
            objectFit: 'cover', objectPosition: '50% 22%', transform: 'scale(1.08)', transformOrigin: '50% 22%',
          }}
        />
      </div>
    );
  }

  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        width: px, height: px, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg,#E8EDF4,#D7E0EC)',
        fontFamily: '"Plus Jakarta Sans Variable",system-ui,sans-serif',
        fontSize: FONT[size], fontWeight: 700, color: 'var(--blue)', ...ringStyle, ...clickable,
      }}
    >
      {initials}
    </div>
  );
}
