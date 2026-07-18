// Real 2026 Wimbledon – Men's Singles, Round of 32 → Final.
// Sourced from Wikipedia (raw wikitext). Slot indices encode the draw tree:
// R16 slot i is fed by R32 slots 2i and 2i+1, and so on.

export type WRound = 'R32' | 'R16' | 'QF' | 'SF' | 'F';
export interface WPlayer { name: string; seed: number | null; }
export interface WMatch {
  round: WRound; slot: number; half: 'top' | 'bottom';
  p1: WPlayer; p2: WPlayer; winner: string; score: string;
}

export const WIMBLEDON_2026_CHAMPION = 'Jannik Sinner';
export const WIMBLEDON_2026_RUNNERUP = 'Alexander Zverev';

export const WIMBLEDON_2026: WMatch[] = [
  { round: 'R32', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Jenson Brooksby', seed: null }, winner: 'Jannik Sinner', score: '6-4, 6-3, 6-4' },
  { round: 'R32', slot: 1, half: 'top', p1: { name: 'Rafael Jodar', seed: 23 }, p2: { name: 'Shintaro Mochizuki', seed: null }, winner: 'Shintaro Mochizuki', score: '1-6, 7-6(5), 6-4, 6-4' },
  { round: 'R32', slot: 2, half: 'top', p1: { name: 'Hubert Hurkacz', seed: null }, p2: { name: 'Tommy Paul', seed: 21 }, winner: 'Hubert Hurkacz', score: '4-6, 7-6(5), 7-5, 6-2' },
  { round: 'R32', slot: 3, half: 'top', p1: { name: 'Jan-Lennard Struff', seed: null }, p2: { name: 'Daniil Medvedev', seed: 8 }, winner: 'Jan-Lennard Struff', score: '7-6(4), 7-6(5), 7-5' },
  { round: 'R32', slot: 4, half: 'top', p1: { name: 'Felix Auger-Aliassime', seed: 3 }, p2: { name: 'Michael Zheng', seed: null }, winner: 'Felix Auger-Aliassime', score: '7-6(1), 6-2, 6-1' },
  { round: 'R32', slot: 5, half: 'top', p1: { name: 'Alejandro Davidovich Fokina', seed: 22 }, p2: { name: 'Marton Fucsovics', seed: null }, winner: 'Alejandro Davidovich Fokina', score: '7-6(3), 6-2, 6-3' },
  { round: 'R32', slot: 6, half: 'top', p1: { name: 'Roman Safiullin', seed: null }, p2: { name: 'Joao Fonseca', seed: 24 }, winner: 'Roman Safiullin', score: '6-3, 6-3, 6-3' },
  { round: 'R32', slot: 7, half: 'top', p1: { name: 'Arthur Rinderknech', seed: 25 }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '7-5, 6-4, 1-6, 7-6(4)' },
  { round: 'R32', slot: 8, half: 'bottom', p1: { name: 'Alex de Minaur', seed: 5 }, p2: { name: 'Zachary Svajda', seed: null }, winner: 'Alex de Minaur', score: '6-2, 5-7, 6-2, 6-4' },
  { round: 'R32', slot: 9, half: 'bottom', p1: { name: 'Karen Khachanov', seed: 19 }, p2: { name: 'Flavio Cobolli', seed: 9 }, winner: 'Flavio Cobolli', score: '0-6, 7-6(4), 6-7(5), 6-2, 6-2' },
  { round: 'R32', slot: 10, half: 'bottom', p1: { name: 'Grigor Dimitrov', seed: null }, p2: { name: 'Matteo Berrettini', seed: null }, winner: 'Grigor Dimitrov', score: '6-3, 6-4, 3-6, 5-7, 6-3' },
  { round: 'R32', slot: 11, half: 'bottom', p1: { name: 'Zizou Bergs', seed: null }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '2-6, 7-5, 2-6, 7-6(3), 7-6(5)' },
  { round: 'R32', slot: 12, half: 'bottom', p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Lorenzo Sonego', seed: null }, winner: 'Taylor Fritz', score: '4-6, 6-3, 6-4, 7-6(5)' },
  { round: 'R32', slot: 13, half: 'bottom', p1: { name: 'Frances Tiafoe', seed: 17 }, p2: { name: 'Alexander Bublik', seed: 10 }, winner: 'Alexander Bublik', score: '4-6, 7-6(5), 7-6(11), 4-6, 6-3' },
  { round: 'R32', slot: 14, half: 'bottom', p1: { name: 'Jiri Lehecka', seed: 13 }, p2: { name: 'Jaume Munar', seed: null }, winner: 'Jiri Lehecka', score: '6-4, 6-4, 4-6, 6-4' },
  { round: 'R32', slot: 15, half: 'bottom', p1: { name: 'Marcos Giron', seed: null }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-2, 7-6(4), 6-4' },

  { round: 'R16', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Shintaro Mochizuki', seed: null }, winner: 'Jannik Sinner', score: '6-3, 7-6(0), 6-3' },
  { round: 'R16', slot: 1, half: 'top', p1: { name: 'Hubert Hurkacz', seed: null }, p2: { name: 'Jan-Lennard Struff', seed: null }, winner: 'Jan-Lennard Struff', score: '3-6, 6-7(5), 7-6(2), 7-5, 4-2 ret.' },
  { round: 'R16', slot: 2, half: 'top', p1: { name: 'Felix Auger-Aliassime', seed: 3 }, p2: { name: 'Alejandro Davidovich Fokina', seed: 22 }, winner: 'Felix Auger-Aliassime', score: '6-7(4), 7-6(6), 6-3, 6-7(2), 6-1' },
  { round: 'R16', slot: 3, half: 'top', p1: { name: 'Roman Safiullin', seed: null }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '7-6(6), 6-3, 3-6, 6-3' },
  { round: 'R16', slot: 4, half: 'bottom', p1: { name: 'Alex de Minaur', seed: 5 }, p2: { name: 'Flavio Cobolli', seed: 9 }, winner: 'Flavio Cobolli', score: '7-5, 7-6(4), 6-3' },
  { round: 'R16', slot: 5, half: 'bottom', p1: { name: 'Grigor Dimitrov', seed: null }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '7-5, 3-6, 4-6, 6-4, 7-6(7)' },
  { round: 'R16', slot: 6, half: 'bottom', p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Alexander Bublik', seed: 10 }, winner: 'Taylor Fritz', score: '7-6(1), 6-4, 6-4' },
  { round: 'R16', slot: 7, half: 'bottom', p1: { name: 'Jiri Lehecka', seed: 13 }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-4, 7-5, 3-6, 7-6(6)' },

  { round: 'QF', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Jan-Lennard Struff', seed: null }, winner: 'Jannik Sinner', score: '7-5, 7-6(4), 6-3' },
  { round: 'QF', slot: 1, half: 'top', p1: { name: 'Felix Auger-Aliassime', seed: 3 }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '7-6(10), 3-6, 6-3, 6-7(4), 7-6(4)' },
  { round: 'QF', slot: 2, half: 'bottom', p1: { name: 'Flavio Cobolli', seed: 9 }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '6-4, 7-6(4), 6-0' },
  { round: 'QF', slot: 3, half: 'bottom', p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-4, 6-4, 6-2' },

  { round: 'SF', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Jannik Sinner', score: '6-4, 6-4, 6-4' },
  { round: 'SF', slot: 1, half: 'bottom', p1: { name: 'Arthur Fery', seed: null }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '7-6(0), 6-2, 6-4' },

  { round: 'F', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Jannik Sinner', score: '6-7(7), 7-6(2), 6-3, 6-4' },
];
