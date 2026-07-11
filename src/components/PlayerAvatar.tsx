import { useState } from 'react';
import { getAvatarUri } from '../data/playerAvatars';
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

// Source priority: realistic online headshot (/avatars) → illustrated fallback → initials.
export default function PlayerAvatar({ playerId, name, size = 'md', className = '', ring = true, onClick }: Props) {
  const px = SIZE[size];
  const [stage, setStage] = useState(0); // 0 photo, 1 illustration, 2 initials

  let ringColor = 'rgba(10,27,51,0.16)';
  try { ringColor = TIER_META[getTier(getPlayer(playerId).ranking)].color; } catch { /* unknown id */ }
  const ringStyle = ring
    ? { boxShadow: `0 0 0 2px ${ringColor}, 0 0 0 3px rgba(255,255,255,0.6)` }
    : { boxShadow: 'inset 0 0 0 1px rgba(10,27,51,0.14)' };
  const clickable = onClick ? { cursor: 'pointer' } : {};

  const svgUri = getAvatarUri(playerId);
  const src = stage === 0 ? `/avatars/${playerId}.png` : stage === 1 ? svgUri : null;

  if (src) {
    return (
      <img
        key={src}
        src={src}
        alt={name}
        width={px}
        height={px}
        className={className}
        onError={() => setStage(s => s + 1)}
        onClick={onClick}
        style={{
          width: px, height: px, borderRadius: '50%', flexShrink: 0, display: 'block',
          objectFit: 'cover', objectPosition: 'center 20%', ...ringStyle, ...clickable,
        }}
      />
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
        fontSize: FONT[size], fontWeight: 700, color: '#1466D6', ...ringStyle, ...clickable,
      }}
    >
      {initials}
    </div>
  );
}
