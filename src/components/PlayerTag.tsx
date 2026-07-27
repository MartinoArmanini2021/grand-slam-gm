import type { CSSProperties } from 'react';
import { nickOf } from '../data/nicknames';

// A small line shown above a player's name: their country flag, and — when they have
// one — their nickname in quotes (e.g.  🇮🇹 “The Carrot”). Players without a nickname
// just show the flag, so every player still carries one.
export default function PlayerTag({
  playerId, flag, className = '', style,
}: {
  playerId: string;
  flag: string;
  className?: string;
  style?: CSSProperties;
}) {
  const nick = nickOf(playerId);
  return (
    <div className={className} style={style}>
      <span aria-hidden="true">{flag}</span>
      {nick && <span style={{ marginLeft: 5 }}>“{nick}”</span>}
    </div>
  );
}
