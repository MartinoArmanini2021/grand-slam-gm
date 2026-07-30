import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useProfile, markTournamentJoined } from '../store/profileStore';
import { useGameStore } from '../store/gameStore';
import { TOURNAMENT, SURFACE } from '../data/tournamentConfig';
import { SQUAD_SIZE, STARTING_BUDGET } from '../data/squadRules';
import { track } from '../data/analytics';
import Logo from './Logo';
import CountrySelect from './CountrySelect';

const EMBLEMS = ['🎾', '🏆', '🔥', '⚡', '🐐', '🦅', '💥', '🎯', '🚀', '🧨'];

// ── Onboarding gate ──────────────────────────────────────────────────────────
// Shown once, the first time a player enters a given tournament (they haven't
// joined it yet). It collects the identity every leaderboard needs (team name +
// handle, plus country / email) and, on JOIN, guarantees a clean squad — every
// tournament is a fresh start. Because it sits before the app is reachable, a
// player can't draft before joining, so there's never legacy state to carry over.
export default function JoinTournament({ onJoined }: { onJoined: () => void }) {
  const { user } = useAuth();
  const profile = useProfile();
  // Personalise the defaults from the account email so the player can join in a single
  // tap — every field is pre-filled and still fully editable here (and later in the
  // profile). Only the team name is required.
  const emailLocal = (user?.email || profile.email || '').split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  const nice = emailLocal ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1) : '';
  const [teamName, setTeamName] = useState(profile.teamName && profile.teamName !== 'My Team' ? profile.teamName : (nice ? `${nice}'s Squad` : ''));
  const [username, setUsername] = useState(profile.username || emailLocal);
  const [country, setCountry] = useState(profile.country);
  const [emblem, setEmblem] = useState(profile.teamEmblem && profile.teamEmblem !== '🎾' ? profile.teamEmblem : '🎾');
  const [error, setError] = useState<string | null>(null);

  const accent = SURFACE.accent;

  const join = () => {
    if (!teamName.trim()) { setError('Give your team a name.'); return; }
    // Handle isn't required — default it from the team name so the leaderboard always
    // has something recognisable; the player can refine it anytime in their profile.
    const handle = username.trim() || teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'manager';
    useProfile.getState().set({
      teamName: teamName.trim(),
      username: handle,
      country: country.trim(),
      teamEmblem: emblem,
    });
    markTournamentJoined(TOURNAMENT.id);
    // Every tournament is a fresh start — guarantee a clean squad on join.
    useGameStore.getState().resetGame();
    track('tournament_joined', { tournament: TOURNAMENT.id });
    onJoined();
  };

  const field = { background: 'var(--raised)', border: '1px solid rgba(10,27,51,0.12)', color: 'var(--ink)' } as const;
  const loc = TOURNAMENT.location.split(',')[0];

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'linear-gradient(150deg,var(--ink) 0%,var(--navy-2) 55%,#0e2a52 100%)' }}>
      <div className="w-full my-auto" style={{ maxWidth: 440 }}>
        <div className="flex justify-center mb-5"><Logo height={38} reversed /></div>

        <div className="rounded-2xl overflow-hidden fade-in" style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
          {/* Hero — the tournament, styled in its surface accent */}
          <div className="px-6 pt-6 pb-5 text-center relative" style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}05)`, borderBottom: `1px solid ${accent}22` }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] mb-1" style={{ color: accent }}>You're invited</div>
            <h1 className="text-2xl font-extrabold leading-tight" style={{ color: 'var(--ink)' }}>{TOURNAMENT.edition}</h1>
            <div className="text-sm font-bold uppercase tracking-[0.16em] mt-1" style={{ color: 'var(--ink-2)' }}>{loc} · {SURFACE.label}</div>
            <div className="text-xs mt-2.5" style={{ color: 'var(--ink-3)' }}>
              Draft {SQUAD_SIZE} players · ${STARTING_BUDGET}M budget · captain for ×2 · beat your friends
            </div>
          </div>

          {/* Identity — what the leaderboard shows */}
          <div className="p-5 space-y-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Team name</label>
              <div className="flex gap-2 mt-1">
                <div className="relative shrink-0">
                  <select value={emblem} onChange={e => setEmblem(e.target.value)} aria-label="Team emblem"
                    className="h-full text-xl pl-2.5 pr-6 rounded-xl appearance-none text-center cursor-pointer" style={field}>
                    {EMBLEMS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none" style={{ color: 'var(--ink-3)' }}>▾</span>
                </div>
                <input value={teamName} onChange={e => { setTeamName(e.target.value); setError(null); }} maxLength={28}
                  placeholder="e.g. Smash Bros" aria-label="Team name"
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl" style={field} />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Your handle</label>
              <input value={username} onChange={e => { setUsername(e.target.value); setError(null); }} maxLength={20}
                placeholder="@yourname" aria-label="Username"
                className="w-full text-sm px-3 py-2.5 rounded-xl mt-1" style={field} />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Country</label>
              <div className="mt-1"><CountrySelect value={country} onChange={setCountry} /></div>
            </div>


            {error && (
              <div className="text-xs rounded-xl px-3 py-2.5" style={{ background: 'rgba(229,71,43,0.08)', border: '1px solid rgba(229,71,43,0.25)', color: '#c0341c' }}>{error}</div>
            )}

            <button onClick={join}
              className="w-full min-h-[48px] py-3 rounded-xl font-extrabold text-sm text-white transition-transform active:scale-[0.99]"
              style={{ background: accent, boxShadow: `0 8px 22px ${accent}55` }}>
              Join the {TOURNAMENT.name} →
            </button>
            <p className="text-[11px] text-center" style={{ color: 'var(--ink-3)' }}>
              Fresh start — you'll draft a brand-new squad for this tournament.
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--on-navy-2)' }}>Grand Slam GM · {TOURNAMENT.edition} fantasy</p>
      </div>
    </div>
  );
}
