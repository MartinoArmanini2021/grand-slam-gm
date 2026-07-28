import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useAuth } from '../auth/AuthProvider';
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
  useEffect(() => {
    if (!user) { setRows([]); return; }
    let cancelled = false;
    const load = async () => {
      const lid = leagueId ?? await publicLeagueId();
      if (!lid || cancelled) return;
      const r = await fetchLeaderboard(lid, TOURNAMENT.id);
      if (!cancelled) setRows(r);
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user, leagueId]);
  return rows;
}

// The single source of truth for a league's standings, sorted by score (then name).
// Only REAL players: the league's signed-in members from the cloud, plus your own
// team. No AI bots. Shared by the Home leaderboard and the League page.
export function useLeagueBoard(leagueId: string | null = null): BoardEntry[] {
  const { myTeam, myScore, budget } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();
  const { user } = useAuth();
  const cloud = useCloudBoard(leagueId);

  // Real other players (exclude yourself — your live local row represents you).
  const cloudRows: BoardEntry[] = cloud
    .filter(r => r.userId !== user?.id)
    .map(r => ({
      id: r.userId, name: r.teamName, emblem: r.teamEmblem,
      manager: r.username ? `@${r.username}` : '@player',
      motto: '', color: colorFor(r.userId), squad: r.squad, budget: r.budget, score: r.score, you: false,
      captain: r.captain, viceCaptain: r.viceCaptain,
    }));

  const board: BoardEntry[] = [
    ...cloudRows,
    ...(myTeam.length > 0 ? [{
      id: 'you', name: teamName, emblem: teamEmblem, manager: username ? `@${username}` : '@you',
      motto: 'Your squad', color: '#0e6fc4', squad: myTeam, budget, score: myScore, you: true,
      captain: useGameStore.getState().captain, viceCaptain: useGameStore.getState().viceCaptain,
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
