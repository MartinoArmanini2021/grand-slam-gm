import { youtubeSearchUrl } from '../data/video';

// A small YouTube-style play button (red circle, white ▶) that opens a YouTube search
// for the player in a new tab. It stops click propagation so it never triggers the row
// or card it sits inside (e.g. opening the player page or picking the player).
export default function PlayerVideoButton({
  name, size = 'sm', className = '',
}: { name: string; size?: 'sm' | 'md'; className?: string }) {
  const box = size === 'md' ? 'w-8 h-8' : 'w-6 h-6';
  const icon = size === 'md' ? 15 : 12;
  return (
    <a
      href={youtubeSearchUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={`Watch ${name} on YouTube`}
      aria-label={`Watch ${name} play on YouTube`}
      className={`inline-flex items-center justify-center rounded-full shrink-0 transition-transform active:scale-90 hover:opacity-85 ${box} ${className}`}
      style={{ background: '#FF0000', color: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    </a>
  );
}
