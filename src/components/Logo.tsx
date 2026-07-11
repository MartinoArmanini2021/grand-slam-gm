// Grand Slam GM logo — built to the brand handoff.
// Navy #0a1f44 wordmark, blue #0e6fc4 ball + "GM", Urbanist 800.

const NAVY = '#0a1f44';
const BLUE = '#0e6fc4';
const LIGHT_BLUE = '#4aa8ea';
const URBANIST = '"Urbanist", system-ui, sans-serif';

// The tennis-ball mark. Seams "cut" the ball, so their stroke = the ground colour.
export function BallMark({ size = 32, fill = BLUE, seam = '#ffffff', className }: { size?: number; fill?: string; seam?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <circle cx="50" cy="50" r="45" fill={fill} />
      <path d="M12,26 C34,44 34,56 12,74" fill="none" stroke={seam} strokeWidth="6" strokeLinecap="round" />
      <path d="M88,26 C66,44 66,56 88,74" fill="none" stroke={seam} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  height?: number;      // overall lockup height in px
  reversed?: boolean;   // true = white/light-blue for a navy field
  markOnly?: boolean;   // just the ball
  className?: string;
}

export default function Logo({ height = 30, reversed = false, markOnly = false, className }: Props) {
  const grand = reversed ? '#ffffff' : NAVY;
  const gm = reversed ? LIGHT_BLUE : BLUE;
  const rule = reversed ? 'rgba(255,255,255,0.4)' : 'rgba(10,31,68,0.3)';
  const seam = reversed ? NAVY : '#ffffff'; // ball on navy field → navy seams

  if (markOnly) return <BallMark size={height} fill={BLUE} seam={seam} className={className} />;

  const font = Math.round(height * 0.58);

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: Math.round(height * 0.34) }}>
      <BallMark size={height} fill={BLUE} seam={seam} />
      <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(height * 0.26) }}>
        <span style={{ fontFamily: URBANIST, fontWeight: 800, fontSize: font, letterSpacing: '0.005em', color: grand, lineHeight: 1, whiteSpace: 'nowrap' }}>
          GRAND SLAM
        </span>
        <span style={{ width: 2, height: Math.round(height * 0.62), background: rule }} />
        <span style={{ fontFamily: URBANIST, fontWeight: 800, fontSize: font, letterSpacing: '0.02em', color: gm, lineHeight: 1 }}>
          GM
        </span>
      </div>
    </div>
  );
}
