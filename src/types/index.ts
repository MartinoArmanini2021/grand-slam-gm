export type Surface = 'hard' | 'clay' | 'grass';
export type FormResult = 'W' | 'L';
export type TournamentResult = 'W' | 'F' | 'SF' | 'QF' | 'R16' | 'R32' | 'R64' | 'R128' | 'DNS';
export type RoundId = 'R128' | 'R64' | 'R32' | 'R16' | 'QF' | 'SF' | 'F';

export interface YearResult {
  tournament: string;
  surface: Surface;
  short: string; // e.g. 'AO', 'IW', 'RG'
  result: TournamentResult;
}

export interface Player {
  id: string;
  name: string;
  country: string;
  flag: string;
  ranking: number;
  seed: number | null;
  age: number;
  hand: 'R' | 'L';
  style: string;
  price: number; // in millions
  exit: TournamentResult; // real Wimbledon 2026 exit round ('W' = champion)
  surface: { hard: number; clay: number; grass: number };
  ytd: { wins: number; losses: number; titles: number };
  form: FormResult[]; // last 5 (retired from the UI; kept optional-empty)
  yearResults: YearResult[];
}

export interface Match {
  id: string;
  round: RoundId;
  p1Id: string;
  p2Id: string;
  winnerId: string;
  score: string;
}

export type GamePhase = 'draft' | 'pre_round' | 'round_complete' | 'finished';

export interface RoundScore {
  round: RoundId;
  points: number;
  captainBonus: number;
}

export interface BudgetReturn {
  playerId: string;
  round: RoundId;
  amount: number;
}
