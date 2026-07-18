import { useGameStore } from '../store/gameStore';
import { useProfile } from '../store/profileStore';
import { getRivalTeams } from './rivals';

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

// The single source of truth for the league standings: rivals + your team,
// sorted by score (then name). Shared by the Home leaderboard and the League page.
export function useLeagueBoard(): BoardEntry[] {
  const { myTeam, myScore, budget, currentRoundIndex } = useGameStore();
  const { teamName, teamEmblem, username } = useProfile();
  const rivals = getRivalTeams(currentRoundIndex);

  const board: BoardEntry[] = [
    ...rivals.map(rt => ({
      id: rt.rival.id, name: rt.rival.name, emblem: rt.rival.emblem, manager: rt.rival.manager,
      motto: rt.rival.tag, color: rt.rival.color, squad: rt.squad, budget: rt.budget, score: rt.score, you: false,
    })),
    ...(myTeam.length > 0 ? [{
      id: 'you', name: teamName, emblem: teamEmblem, manager: username ? `@${username}` : '@you',
      motto: 'Your squad', color: '#0e6fc4', squad: myTeam, budget, score: myScore, you: true,
    }] : []),
  ];

  return board.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
