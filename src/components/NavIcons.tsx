import type { CSSProperties, FC } from 'react';

interface IconProps { size?: number; style?: CSSProperties }

const svg = (size = 18): {
  width: number; height: number; viewBox: string; fill: 'none';
  stroke: 'currentColor'; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round';
} => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
});

// Home → tennis ball with its seam
const HomeIcon: FC<IconProps> = ({ size, style }) => (
  <svg {...svg(size)} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5 6.2c3.6 2.8 3.6 8.8 0 11.6" />
    <path d="M19 6.2c-3.6 2.8-3.6 8.8 0 11.6" />
  </svg>
);

// League → trophy
const LeagueIcon: FC<IconProps> = ({ size, style }) => (
  <svg {...svg(size)} style={style}>
    <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 5.5H4V7a3 3 0 0 0 3 3" />
    <path d="M17 5.5h3V7a3 3 0 0 1-3 3" />
    <path d="M12 13.5V17" />
    <path d="M8.5 20h7" />
    <path d="M10 17h4v3h-4z" />
  </svg>
);

// Market → transfer / swap arrows
const MarketIcon: FC<IconProps> = ({ size, style }) => (
  <svg {...svg(size)} style={style}>
    <path d="M4 8.5h13" />
    <path d="M14 5.5l3 3-3 3" />
    <path d="M20 15.5H7" />
    <path d="M10 12.5l-3 3 3 3" />
  </svg>
);

// Bracket → knockout tree (4 → 2 → 1)
const BracketIcon: FC<IconProps> = ({ size, style }) => (
  <svg {...svg(size)} style={style}>
    <path d="M4 5.5h3.5v4h3.5" />
    <path d="M4 18.5h3.5v-4" />
    <path d="M11 9.5h3.5v3h3.5" />
    <path d="M11 14.5h3.5" />
    <path d="M18 12.5h2" />
  </svg>
);

export const NAV_ICONS: Record<string, FC<IconProps>> = {
  home: HomeIcon,
  league: LeagueIcon,
  draft: MarketIcon,
  tournament: BracketIcon,
};
