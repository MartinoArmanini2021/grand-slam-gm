import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useAuth } from '../auth/AuthProvider';
import { useVisiblePoll } from '../hooks';
import { findPlayer } from './players';
import { TOURNAMENT } from './tournamentConfig';
import { publicLeagueId, fetchLeaderboard, fetchMyLeagues, type CloudBoardRow, type MyLeague } from './cloud';

export interface BoardEntry {
  id: string;
  name: string;
  emblem: string;
  manager: string;
  motto: string;
  color: string;
  squad: string[];
  budget: number;
  score: number;
  you: boolean;
  captain: string | null;
  viceCaptain: string | null;
}

// Deterministic accent per real user, so a team keeps the same colour across renders.
const BOARD_COLORS = ['#0e6fc4', '#12A150', '#E5472B', '#8b5cf6', '#d99a00', '#0ea5a5', '#e05299'];
const colorFor = (id: string) =>
  BOARD_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % BOARD_COLORS.length];

// Real players in a league, polled so friends' moves show up. `leagueId` null → the
// public global league. Empty when signed out / guest.
function useCloudBoard(leagueId: string | null): CloudBoardRow[] {
  const { user } = useAuth();
  const [rows, setRows] = useState<CloudBoardRow[]>([]);
  // Guard against a stale async response overwriting a newer one when leagueId/user changes.
  const reqId = useRef(0);
  const load = async () => {
    if (!user) { setRows([]); return; }
    const my = ++reqId.current;
    const lid = leagueId ?? await publicLeagueId();
    if (!lid || my !== reqId.current) return;
    // A specific (private) league lists EVERY member — including friends who joined but
    // haven't drafted. The public global board shows the ranked field.
    const r = await fetchLeaderboard(lid, TOURNAMENT.id, { allMembers: leagueId !== null });
    if (my === reqId.current) setRows(r);
  };
  // Load immediately when the user/league changes…
  useEffect(() => { void load(); if (!user) setRows([]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user, leagueId]);
  // …then refresh on a jittered 20s poll that pauses while the tab is hidden (scale + battery).
  useVisiblePoll(() => void load(), 20_000, !!user);
  return rows;
}

// The single source of truth for a league's standings, sorted by score (then name).
// Only REAL players: the league's signed-in members from the cloud, plus your own
// team. No AI bots. Shared by the Home leaderboard and the League page.
export function useLeagueBoard(leagueId: string | null = null): BoardEntry[] {
  const { myTeam, myScore, budget, captain, viceCaptain } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();
  const { user } = useAuth();
  const cloud = useCloudBoard(leagueId);

  // Real other players (exclude yourself — your live local row represents you). Their
  // cloud squad is sanitized against the CURRENT roster: a foreign entry can hold a
  // player id removed from the field since it was saved, and the detail views resolve
  // ids with the throwing getPlayer() — an unfiltered stale id would white-screen the
  // League/Team page. (Own state is already sanitized on hydrate.)
  const cloudRows: BoardEntry[] = cloud
    .filter(r => r.userId !== user?.id)
    .map(r => ({
      id: r.userId, name: r.teamName, emblem: r.teamEmblem,
      manager: r.username ? `@${r.username}` : '@player',
      motto: '', color: colorFor(r.userId), squad: r.squad.filter(id => !!findPlayer(id)),
      budget: r.budget, score: r.score, you: false,
      captain: r.captain && findPlayer(r.captain) ? r.captain : null,
      viceCaptain: r.viceCaptain && findPlayer(r.viceCaptain) ? r.viceCaptain : null,
    }));

  // Always show YOUR OWN row once you're signed in — even before you've drafted
  // (empty squad → "No squad yet"). A freshly-created account must see itself on the
  // board immediately; we filter the cloud copy of you (above) so this is the only one.
  const board: BoardEntry[] = [
    ...cloudRows,
    ...(user ? [{
      id: 'you', name: teamName, emblem: teamEmblem, manager: username ? `@${username}` : '@you',
      motto: myTeam.length > 0 ? 'Your squad' : 'Draft your squad', color: '#0e6fc4',
      squad: myTeam, budget, score: myScore, you: true, captain, viceCaptain,
    }] : []),
  ];

  return board.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// The private leagues you belong to (public placeholder excluded). `nonce` forces a
// refresh (bump it after create/join/leave/delete). Empty when signed out.
export function useMyLeagues(nonce = 0): MyLeague[] {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  useEffect(() => {
    if (!user) { setLeagues([]); return; }
    let cancelled = false;
    void fetchMyLeagues().then(all => { if (!cancelled) setLeagues(all.filter(l => !l.isPublic)); });
    return () => { cancelled = true; };
  }, [user, nonce]);
  return leagues;
}
