import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { useAuth } from '../auth/AuthProvider';
import { getRivalTeams } from './rivals';
import { TOURNAMENT } from './tournamentConfig';
import { publicLeagueId, fetchLeaderboard, type CloudBoardRow } from './cloud';

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
// Real signed-in players (from the cloud) join your team; AI bots pad ONLY the public
// global board (leagueId null). Shared by the Home leaderboard and the League page.
export function useLeagueBoard(leagueId: string | null = null): BoardEntry[] {
  const { myTeam, myScore, budget, currentRoundIndex } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();
  const { user } = useAuth();
  const cloud = useCloudBoard(leagueId);
  const rivals = leagueId === null ? getRivalTeams(currentRoundIndex) : [];

  // Real other players (exclude yourself — your live local row represents you).
  const cloudRows: BoardEntry[] = cloud
    .filter(r => r.userId !== user?.id)
    .map(r => ({
      id: r.userId, name: r.teamName, emblem: r.teamEmblem,
      manager: r.username ? `@${r.username}` : '@player',
      motto: '', color: colorFor(r.userId), squad: r.squad, budget: r.budget, score: r.score, you: false,
    }));

  const board: BoardEntry[] = [
    ...rivals.map(rt => ({
      id: rt.rival.id, name: rt.rival.name, emblem: rt.rival.emblem, manager: rt.rival.manager,
      motto: rt.rival.tag, color: rt.rival.color, squad: rt.squad, budget: rt.budget, score: rt.score, you: false,
    })),
    ...cloudRows,
    ...(myTeam.length > 0 ? [{
      id: 'you', name: teamName, emblem: teamEmblem, manager: username ? `@${username}` : '@you',
      motto: 'Your squad', color: '#0e6fc4', squad: myTeam, budget, score: myScore, you: true,
    }] : []),
  ];

  return board.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
