// Real 2026 Wimbledon – Men's Singles, Round of 32 → Final.
// Sourced from Wikipedia (raw wikitext). Slot indices encode the draw tree:
// R16 slot i is fed by R32 slots 2i and 2i+1, and so on.

export type WRound = 'R128' | 'R64' | 'R32' | 'R16' | 'QF' | 'SF' | 'F';
export interface WPlayer { name: string; seed: number | null; }
export interface WMatch {
  round: WRound; slot: number; half: 'top' | 'bottom';
  p1: WPlayer; p2: WPlayer; winner: string; score: string;
}

export const WIMBLEDON_2026_CHAMPION = 'Jannik Sinner';
export const WIMBLEDON_2026_RUNNERUP = 'Alexander Zverev';

export const WIMBLEDON_2026: WMatch[] = [
  { round: 'R32', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Jenson Brooksby', seed: null }, winner: 'Jannik Sinner', score: '6-4, 6-3, 6-4' },
  { round: 'R32', slot: 1, half: 'top', p1: { name: 'Rafael Jódar', seed: 23 }, p2: { name: 'Shintaro Mochizuki', seed: null }, winner: 'Shintaro Mochizuki', score: '1-6, 7-6(5), 6-4, 6-4' },
  { round: 'R32', slot: 2, half: 'top', p1: { name: 'Hubert Hurkacz', seed: null }, p2: { name: 'Tommy Paul', seed: 21 }, winner: 'Hubert Hurkacz', score: '4-6, 7-6(5), 7-5, 6-2' },
  { round: 'R32', slot: 3, half: 'top', p1: { name: 'Jan-Lennard Struff', seed: null }, p2: { name: 'Daniil Medvedev', seed: 8 }, winner: 'Jan-Lennard Struff', score: '7-6(4), 7-6(5), 7-5' },
  { round: 'R32', slot: 4, half: 'top', p1: { name: 'Félix Auger-Aliassime', seed: 3 }, p2: { name: 'Michael Zheng', seed: null }, winner: 'Félix Auger-Aliassime', score: '7-6(1), 6-2, 6-1' },
  { round: 'R32', slot: 5, half: 'top', p1: { name: 'Alejandro Davidovich Fokina', seed: 22 }, p2: { name: 'Marton Fucsovics', seed: null }, winner: 'Alejandro Davidovich Fokina', score: '7-6(3), 6-2, 6-3' },
  { round: 'R32', slot: 6, half: 'top', p1: { name: 'Roman Safiullin', seed: null }, p2: { name: 'João Fonseca', seed: 24 }, winner: 'Roman Safiullin', score: '6-3, 6-3, 6-3' },
  { round: 'R32', slot: 7, half: 'top', p1: { name: 'Arthur Rinderknech', seed: 25 }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '7-5, 6-4, 1-6, 7-6(4)' },
  { round: 'R32', slot: 8, half: 'bottom', p1: { name: 'Alex de Minaur', seed: 5 }, p2: { name: 'Zachary Svajda', seed: null }, winner: 'Alex de Minaur', score: '6-2, 5-7, 6-2, 6-4' },
  { round: 'R32', slot: 9, half: 'bottom', p1: { name: 'Karen Khachanov', seed: 19 }, p2: { name: 'Flavio Cobolli', seed: 9 }, winner: 'Flavio Cobolli', score: '0-6, 7-6(4), 6-7(5), 6-2, 6-2' },
  { round: 'R32', slot: 10, half: 'bottom', p1: { name: 'Grigor Dimitrov', seed: null }, p2: { name: 'Matteo Berrettini', seed: null }, winner: 'Grigor Dimitrov', score: '6-3, 6-4, 3-6, 5-7, 6-3' },
  { round: 'R32', slot: 11, half: 'bottom', p1: { name: 'Zizou Bergs', seed: null }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '2-6, 7-5, 2-6, 7-6(3), 7-6(5)' },
  { round: 'R32', slot: 12, half: 'bottom', p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Lorenzo Sonego', seed: null }, winner: 'Taylor Fritz', score: '4-6, 6-3, 6-4, 7-6(5)' },
  { round: 'R32', slot: 13, half: 'bottom', p1: { name: 'Frances Tiafoe', seed: 17 }, p2: { name: 'Alexander Bublik', seed: 10 }, winner: 'Alexander Bublik', score: '4-6, 7-6(5), 7-6(11), 4-6, 6-3' },
  { round: 'R32', slot: 14, half: 'bottom', p1: { name: 'Jiří Lehečka', seed: 13 }, p2: { name: 'Jaume Munar', seed: null }, winner: 'Jiří Lehečka', score: '6-4, 6-4, 4-6, 6-4' },
  { round: 'R32', slot: 15, half: 'bottom', p1: { name: 'Marcos Giron', seed: null }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-2, 7-6(4), 6-4' },

  { round: 'R16', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Shintaro Mochizuki', seed: null }, winner: 'Jannik Sinner', score: '6-3, 7-6(0), 6-3' },
  { round: 'R16', slot: 1, half: 'top', p1: { name: 'Hubert Hurkacz', seed: null }, p2: { name: 'Jan-Lennard Struff', seed: null }, winner: 'Jan-Lennard Struff', score: '3-6, 6-7(5), 7-6(2), 7-5, 4-2 ret.' },
  { round: 'R16', slot: 2, half: 'top', p1: { name: 'Félix Auger-Aliassime', seed: 3 }, p2: { name: 'Alejandro Davidovich Fokina', seed: 22 }, winner: 'Félix Auger-Aliassime', score: '6-7(4), 7-6(6), 6-3, 6-7(2), 6-1' },
  { round: 'R16', slot: 3, half: 'top', p1: { name: 'Roman Safiullin', seed: null }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '7-6(6), 6-3, 3-6, 6-3' },
  { round: 'R16', slot: 4, half: 'bottom', p1: { name: 'Alex de Minaur', seed: 5 }, p2: { name: 'Flavio Cobolli', seed: 9 }, winner: 'Flavio Cobolli', score: '7-5, 7-6(4), 6-3' },
  { round: 'R16', slot: 5, half: 'bottom', p1: { name: 'Grigor Dimitrov', seed: null }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '7-5, 3-6, 4-6, 6-4, 7-6(7)' },
  { round: 'R16', slot: 6, half: 'bottom', p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Alexander Bublik', seed: 10 }, winner: 'Taylor Fritz', score: '7-6(1), 6-4, 6-4' },
  { round: 'R16', slot: 7, half: 'bottom', p1: { name: 'Jiří Lehečka', seed: 13 }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-4, 7-5, 3-6, 7-6(6)' },

  { round: 'QF', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Jan-Lennard Struff', seed: null }, winner: 'Jannik Sinner', score: '7-5, 7-6(4), 6-3' },
  { round: 'QF', slot: 1, half: 'top', p1: { name: 'Félix Auger-Aliassime', seed: 3 }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '7-6(10), 3-6, 6-3, 6-7(4), 7-6(4)' },
  { round: 'QF', slot: 2, half: 'bottom', p1: { name: 'Flavio Cobolli', seed: 9 }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '6-4, 7-6(4), 6-0' },
  { round: 'QF', slot: 3, half: 'bottom', p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-4, 6-4, 6-2' },

  { round: 'SF', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Jannik Sinner', score: '6-4, 6-4, 6-4' },
  { round: 'SF', slot: 1, half: 'bottom', p1: { name: 'Arthur Fery', seed: null }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '7-6(0), 6-2, 6-4' },

  { round: 'F', slot: 0, half: 'top', p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Jannik Sinner', score: '6-7(7), 7-6(2), 6-3, 6-4' },
];

// ── The full first two rounds (R128, R64) — display only ─────────────────────
// Sourced from Wikipedia in draw order (sections 1-8). Kept separate from the
// scored bracket above so the game engine still runs on the last 32. Slot = draw
// index; half = top for the first half of the field, bottom for the second.
type RawEarly = { p1: WPlayer; p2: WPlayer; winner: string; score: string };

const R128_RAW: RawEarly[] = [
  { p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Miomir Kecmanović', seed: null }, winner: 'Jannik Sinner', score: '4-6, 6-3, 6-7(6), 6-2, 6-3' },
  { p1: { name: 'Nuno Borges', seed: null }, p2: { name: 'Tristan Boyer', seed: null }, winner: 'Nuno Borges', score: '6-3, 7-5, 7-5' },
  { p1: { name: 'Aleksandar Vukic', seed: null }, p2: { name: 'Jenson Brooksby', seed: null }, winner: 'Jenson Brooksby', score: '7-6(7), 6-1, 6-1' },
  { p1: { name: 'Emilio Nava', seed: null }, p2: { name: 'Ignacio Buse', seed: 31 }, winner: 'Ignacio Buse', score: '7-6(3), 3-6, 7-5, 6-0' },
  { p1: { name: 'Rafael Jódar', seed: 23 }, p2: { name: 'Felix Gill', seed: null }, winner: 'Rafael Jódar', score: '6-3, 6-3, 7-5' },
  { p1: { name: 'Denis Shapovalov', seed: null }, p2: { name: 'Pablo Carreño Busta', seed: null }, winner: 'Pablo Carreño Busta', score: '6-3, 7-6(7), 0-0 ret.' },
  { p1: { name: 'Shintaro Mochizuki', seed: null }, p2: { name: 'Max Basing', seed: null }, winner: 'Shintaro Mochizuki', score: '6-3, 6-0, 6-0' },
  { p1: { name: 'Ethan Quinn', seed: null }, p2: { name: 'Luciano Darderi', seed: 14 }, winner: 'Ethan Quinn', score: '7-6(7), 7-5, 6-2' },
  { p1: { name: 'Casper Ruud', seed: 11 }, p2: { name: 'Hubert Hurkacz', seed: null }, winner: 'Hubert Hurkacz', score: '6-4, 6-2, 7-6(7)' },
  { p1: { name: 'Hamad Medjedovic', seed: null }, p2: { name: 'Sebastian Ofner', seed: null }, winner: 'Sebastian Ofner', score: '1-6, 6-2, 4-6, 6-3, 6-4' },
  { p1: { name: 'Kwon Soon-woo', seed: null }, p2: { name: 'Martín Landaluce', seed: null }, winner: 'Kwon Soon-woo', score: '6-4, 6-3, 6-3' },
  { p1: { name: 'Alexandre Müller', seed: null }, p2: { name: 'Tommy Paul', seed: 21 }, winner: 'Tommy Paul', score: '6-1, 6-2, 6-1' },
  { p1: { name: 'Brandon Nakashima', seed: 28 }, p2: { name: 'Jack Pinnington Jones', seed: null }, winner: 'Brandon Nakashima', score: '6-3, 7-6(5), 7-5' },
  { p1: { name: 'Jan-Lennard Struff', seed: null }, p2: { name: 'Sebastián Báez', seed: null }, winner: 'Jan-Lennard Struff', score: '6-1, 7-6(4), 4-6, 2-6, 7-5' },
  { p1: { name: 'Camilo Ugo Carabelli', seed: null }, p2: { name: 'Daniel Mérida', seed: null }, winner: 'Daniel Mérida', score: '4-6, 3-6, 6-2, 3-0 ret.' },
  { p1: { name: 'Marin Čilić', seed: null }, p2: { name: 'Daniil Medvedev', seed: 8 }, winner: 'Daniil Medvedev', score: '6-1, 6-2, 6-4' },
  { p1: { name: 'Félix Auger-Aliassime', seed: 3 }, p2: { name: 'Alexander Shevchenko', seed: null }, winner: 'Félix Auger-Aliassime', score: '6-3, 6-1, 6-4' },
  { p1: { name: 'Adam Walton', seed: null }, p2: { name: 'Dino Prižmić', seed: null }, winner: 'Dino Prižmić', score: '4-6, 7-6(3), 6-4, 6-2' },
  { p1: { name: 'Daniel Vallejo', seed: null }, p2: { name: 'Nicolás Mejía', seed: null }, winner: 'Nicolás Mejía', score: '4-6, 6-4, 7-5, 7-6(2)' },
  { p1: { name: 'Michael Zheng', seed: null }, p2: { name: 'Cameron Norrie', seed: 26 }, winner: 'Michael Zheng', score: '6-7(7), 6-2, 6-7(2), 6-3, 7-6(4)' },
  { p1: { name: 'Alejandro Davidovich Fokina', seed: 22 }, p2: { name: 'Juan Manuel Cerúndolo', seed: null }, winner: 'Alejandro Davidovich Fokina', score: '6-4, 6-4, 7-6(2)' },
  { p1: { name: 'Thiago Agustín Tirante', seed: null }, p2: { name: 'Fábián Marozsán', seed: null }, winner: 'Fábián Marozsán', score: '7-5, 6-3, 6-4' },
  { p1: { name: 'Luca Van Assche', seed: null }, p2: { name: 'Márton Fucsovics', seed: null }, winner: 'Márton Fucsovics', score: '6-3, 4-0 ret.' },
  { p1: { name: 'Dalibor Svrčina', seed: null }, p2: { name: 'Learner Tien', seed: 16 }, winner: 'Learner Tien', score: '6-1, 6-4, 6-7(4), 6-3' },
  { p1: { name: 'Andrey Rublev', seed: 12 }, p2: { name: 'Roman Safiullin', seed: null }, winner: 'Roman Safiullin', score: '6-4, 6-7(6), 3-6, 6-3, 7-6(12)' },
  { p1: { name: 'Aleksandar Kovacevic', seed: null }, p2: { name: 'Botic van de Zandschulp', seed: null }, winner: 'Botic van de Zandschulp', score: '6-3, 6-7(2), 6-4, 6-0' },
  { p1: { name: 'Jesper de Jong', seed: null }, p2: { name: 'Rinky Hijikata', seed: null }, winner: 'Jesper de Jong', score: '7-6(4), 3-6, 5-7, 6-4, 6-3' },
  { p1: { name: 'Roberto Bautista Agut', seed: null }, p2: { name: 'João Fonseca', seed: 24 }, winner: 'João Fonseca', score: '7-6(4), 6-4, 6-3' },
  { p1: { name: 'Arthur Rinderknech', seed: 25 }, p2: { name: 'Oliver Tarvet', seed: null }, winner: 'Arthur Rinderknech', score: '7-6(4), 7-6(4), 4-6, 7-5' },
  { p1: { name: 'Marco Trungelliti', seed: null }, p2: { name: 'Martin Damm', seed: null }, winner: 'Martin Damm', score: '7-6(5), 6-7(5), 7-6(2), 7-6(5)' },
  { p1: { name: 'Hugo Gaston', seed: null }, p2: { name: 'Stefanos Tsitsipas', seed: null }, winner: 'Stefanos Tsitsipas', score: '6-1, 6-4, 6-2' },
  { p1: { name: 'Wu Yibing', seed: null }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '6-4, 5-7, 6-4, 6-4' },
  { p1: { name: 'Alex de Minaur', seed: 5 }, p2: { name: 'Román Andrés Burruchaga', seed: null }, winner: 'Alex de Minaur', score: '7-6(5), 6-1, 6-0' },
  { p1: { name: 'Adrian Mannarino', seed: null }, p2: { name: 'Titouan Droguet', seed: null }, winner: 'Adrian Mannarino', score: '6-2, 6-4, 6-1' },
  { p1: { name: 'Pablo Llamas Ruiz', seed: null }, p2: { name: 'Zachary Svajda', seed: null }, winner: 'Zachary Svajda', score: '6-1, 6-2, 6-4' },
  { p1: { name: 'Kamil Majchrzak', seed: null }, p2: { name: 'Alejandro Tabilo', seed: 30 }, winner: 'Kamil Majchrzak', score: '6-3, 7-5, 7-5' },
  { p1: { name: 'Karen Khachanov', seed: 19 }, p2: { name: 'Billy Harris', seed: null }, winner: 'Karen Khachanov', score: '6-3, 5-7, 6-3, 6-3' },
  { p1: { name: 'Yannick Hanfmann', seed: null }, p2: { name: 'Giovanni Mpetshi Perricard', seed: null }, winner: 'Yannick Hanfmann', score: '6-7(6), 7-6(9), 6-2, 6-3' },
  { p1: { name: 'Tallon Griekspoor', seed: null }, p2: { name: 'James Duckworth', seed: null }, winner: 'James Duckworth', score: '6-4, 4-6, 7-5, 6-4' },
  { p1: { name: 'Mariano Navone', seed: null }, p2: { name: 'Flavio Cobolli', seed: 9 }, winner: 'Flavio Cobolli', score: '1-6, 7-6(5), 6-3, 7-6(8)' },
  { p1: { name: 'Jakub Menšík', seed: 15 }, p2: { name: 'Toby Samuel', seed: null }, winner: 'Jakub Menšík', score: '5-7, 6-3, 6-3, 3-6, 7-6(7)' },
  { p1: { name: 'Dane Sweeny', seed: null }, p2: { name: 'Grigor Dimitrov', seed: null }, winner: 'Grigor Dimitrov', score: '7-6(4), 6-3, 7-5' },
  { p1: { name: 'Stan Wawrinka', seed: null }, p2: { name: 'Matteo Berrettini', seed: null }, winner: 'Matteo Berrettini', score: '6-7(7), 7-6(16), 7-6(7), 7-6(5)' },
  { p1: { name: 'Raphaël Collignon', seed: null }, p2: { name: 'Arthur Fils', seed: 20 }, winner: 'Arthur Fils', score: '7-5, 6-1, 6-3' },
  { p1: { name: 'Ugo Humbert', seed: 27 }, p2: { name: 'Zizou Bergs', seed: null }, winner: 'Zizou Bergs', score: '6-2, 7-5, 4-6, 3-6, 6-3' },
  { p1: { name: 'Sho Shimabukuro', seed: null }, p2: { name: 'Jaime Faria', seed: null }, winner: 'Jaime Faria', score: '7-6(6), 6-3, 6-7(2), 6-3' },
  { p1: { name: 'Damir Džumhur', seed: null }, p2: { name: 'Arthur Fery', seed: null }, winner: 'Arthur Fery', score: '3-6, 6-2, 6-2, 6-1' },
  { p1: { name: 'Otto Virtanen', seed: null }, p2: { name: 'Ben Shelton', seed: 4 }, winner: 'Otto Virtanen', score: '6-4, 3-6, 6-7(8), 6-2, 7-6(9)' },
  { p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Dušan Lajović', seed: null }, winner: 'Taylor Fritz', score: '6-3, 6-4, 6-3' },
  { p1: { name: 'Patrick Kypson', seed: null }, p2: { name: 'Mackenzie McDonald', seed: null }, winner: 'Patrick Kypson', score: '3-6, 6-1, 6-4, 6-4' },
  { p1: { name: 'Benjamin Bonzi', seed: null }, p2: { name: 'Gabriel Diallo', seed: null }, winner: 'Gabriel Diallo', score: '1-6, 4-6, 7-6(5), 6-3, 3-1 ret.' },
  { p1: { name: 'Lorenzo Sonego', seed: null }, p2: { name: 'Tomás Martín Etcheverry', seed: 29 }, winner: 'Lorenzo Sonego', score: '6-4, 6-4, 6-7(2), 7-6(4)' },
  { p1: { name: 'Frances Tiafoe', seed: 17 }, p2: { name: 'Térence Atmane', seed: null }, winner: 'Frances Tiafoe', score: '7-6(6), 6-1, 4-6, 6-4' },
  { p1: { name: 'Vít Kopřiva', seed: null }, p2: { name: 'Jan Choinski', seed: null }, winner: 'Jan Choinski', score: '6-3, 7-5, 6-2' },
  { p1: { name: 'Kyrian Jacquet', seed: null }, p2: { name: 'Vilius Gaubas', seed: null }, winner: 'Kyrian Jacquet', score: '6-3, 6-4, 7-6(2)' },
  { p1: { name: 'Thanasi Kokkinakis', seed: null }, p2: { name: 'Alexander Bublik', seed: 10 }, winner: 'Alexander Bublik', score: '4-6, 6-3, 6-7(10), 6-3, 6-4' },
  { p1: { name: 'Jiří Lehečka', seed: 13 }, p2: { name: 'Alexei Popyrin', seed: null }, winner: 'Jiří Lehečka', score: '6-4, 6-2, 6-4' },
  { p1: { name: 'Alex Molčan', seed: null }, p2: { name: 'Daniel Altmaier', seed: null }, winner: 'Alex Molčan', score: '6-4, 3-6, 7-5, 6-2' },
  { p1: { name: 'Alex Michelsen', seed: null }, p2: { name: 'Jacob Fearnley', seed: null }, winner: 'Jacob Fearnley', score: '3-6, 4-6, 6-2, 6-3, 6-2' },
  { p1: { name: 'Jaume Munar', seed: null }, p2: { name: 'Francisco Cerúndolo', seed: 18 }, winner: 'Jaume Munar', score: '6-1, 6-4, 6-3' },
  { p1: { name: 'Matteo Arnaldi', seed: 32 }, p2: { name: 'Quentin Halys', seed: null }, winner: 'Quentin Halys', score: '3-6, 6-1, 7-6(5), 6-3' },
  { p1: { name: 'Corentin Moutet', seed: null }, p2: { name: 'Marcos Giron', seed: null }, winner: 'Marcos Giron', score: '4-6, 6-4, 7-5, 6-4' },
  { p1: { name: 'Valentin Royer', seed: null }, p2: { name: 'Harry Wendelken', seed: null }, winner: 'Valentin Royer', score: '4-6, 6-3, 6-3, 6-3' },
  { p1: { name: 'Alexander Blockx', seed: null }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-4, 6-7(8), 7-6(5), 7-6(0)' },
];

const R64_RAW: RawEarly[] = [
  { p1: { name: 'Jannik Sinner', seed: 1 }, p2: { name: 'Nuno Borges', seed: null }, winner: 'Jannik Sinner', score: '7-6(4), 7-6(2), 6-4' },
  { p1: { name: 'Jenson Brooksby', seed: null }, p2: { name: 'Ignacio Buse', seed: 31 }, winner: 'Jenson Brooksby', score: '6-2, 6-2, 6-3' },
  { p1: { name: 'Rafael Jódar', seed: 23 }, p2: { name: 'Pablo Carreño Busta', seed: null }, winner: 'Rafael Jódar', score: '3-6, 6-3, 1-6, 6-3, 6-4' },
  { p1: { name: 'Shintaro Mochizuki', seed: null }, p2: { name: 'Ethan Quinn', seed: null }, winner: 'Shintaro Mochizuki', score: '6-2, 7-6(6), 7-5' },
  { p1: { name: 'Hubert Hurkacz', seed: null }, p2: { name: 'Sebastian Ofner', seed: null }, winner: 'Hubert Hurkacz', score: '7-6(8), 6-4, 6-4' },
  { p1: { name: 'Kwon Soon-woo', seed: null }, p2: { name: 'Tommy Paul', seed: 21 }, winner: 'Tommy Paul', score: '6-3, 7-6(4), 6-2' },
  { p1: { name: 'Brandon Nakashima', seed: 28 }, p2: { name: 'Jan-Lennard Struff', seed: null }, winner: 'Jan-Lennard Struff', score: '4-6, 7-6(6), 7-6(5), 6-7(6), 7-6(7)' },
  { p1: { name: 'Daniel Mérida', seed: null }, p2: { name: 'Daniil Medvedev', seed: 8 }, winner: 'Daniil Medvedev', score: '3-6, 6-3, 7-5, 6-2' },
  { p1: { name: 'Félix Auger-Aliassime', seed: 3 }, p2: { name: 'Dino Prižmić', seed: null }, winner: 'Félix Auger-Aliassime', score: '7-6(2), 6-3, 7-5' },
  { p1: { name: 'Nicolás Mejía', seed: null }, p2: { name: 'Michael Zheng', seed: null }, winner: 'Michael Zheng', score: '6-7(4), 7-6(8), 6-1, 6-4' },
  { p1: { name: 'Alejandro Davidovich Fokina', seed: 22 }, p2: { name: 'Fábián Marozsán', seed: null }, winner: 'Alejandro Davidovich Fokina', score: '6-3, 6-0, 6-3' },
  { p1: { name: 'Márton Fucsovics', seed: null }, p2: { name: 'Learner Tien', seed: 16 }, winner: 'Márton Fucsovics', score: '6-7(6), 6-4, 7-6(4), 6-3' },
  { p1: { name: 'Roman Safiullin', seed: null }, p2: { name: 'Botic van de Zandschulp', seed: null }, winner: 'Roman Safiullin', score: '6-0, 4-6, 6-3, 3-6, 7-6(5)' },
  { p1: { name: 'Jesper de Jong', seed: null }, p2: { name: 'João Fonseca', seed: 24 }, winner: 'João Fonseca', score: '6-1, 7-5, 6-4' },
  { p1: { name: 'Arthur Rinderknech', seed: 25 }, p2: { name: 'Martin Damm', seed: null }, winner: 'Arthur Rinderknech', score: '6-4, 7-6(1), 6-3' },
  { p1: { name: 'Stefanos Tsitsipas', seed: null }, p2: { name: 'Novak Djokovic', seed: 7 }, winner: 'Novak Djokovic', score: '6-3, 6-4, 6-2' },
  { p1: { name: 'Alex de Minaur', seed: 5 }, p2: { name: 'Adrian Mannarino', seed: null }, winner: 'Alex de Minaur', score: '6-3, 6-2, 6-2' },
  { p1: { name: 'Zachary Svajda', seed: null }, p2: { name: 'Kamil Majchrzak', seed: null }, winner: 'Zachary Svajda', score: '2-6, 6-2, 6-7(5), 6-4, 6-3' },
  { p1: { name: 'Karen Khachanov', seed: 19 }, p2: { name: 'Yannick Hanfmann', seed: null }, winner: 'Karen Khachanov', score: '6-3, 6-4, 6-4' },
  { p1: { name: 'James Duckworth', seed: null }, p2: { name: 'Flavio Cobolli', seed: 9 }, winner: 'Flavio Cobolli', score: '7-6(4), 3-6, 7-6(3), 6-1' },
  { p1: { name: 'Jakub Menšík', seed: 15 }, p2: { name: 'Grigor Dimitrov', seed: null }, winner: 'Grigor Dimitrov', score: '7-6(5), 4-6, 7-5, 6-3' },
  { p1: { name: 'Matteo Berrettini', seed: null }, p2: { name: 'Arthur Fils', seed: 20 }, winner: 'Matteo Berrettini', score: '6-4, 7-5, 3-6, 6-3' },
  { p1: { name: 'Zizou Bergs', seed: null }, p2: { name: 'Jaime Faria', seed: null }, winner: 'Zizou Bergs', score: '7-6(6), 4-6, 6-2, 6-3' },
  { p1: { name: 'Arthur Fery', seed: null }, p2: { name: 'Otto Virtanen', seed: null }, winner: 'Arthur Fery', score: '5-7, 7-6(3), 6-3, 6-3' },
  { p1: { name: 'Taylor Fritz', seed: 6 }, p2: { name: 'Patrick Kypson', seed: null }, winner: 'Taylor Fritz', score: '6-2, 6-2, 7-5' },
  { p1: { name: 'Gabriel Diallo', seed: null }, p2: { name: 'Lorenzo Sonego', seed: null }, winner: 'Lorenzo Sonego', score: '7-6(4), 4-6, 7-6(4), 6-7(6), 6-2' },
  { p1: { name: 'Frances Tiafoe', seed: 17 }, p2: { name: 'Jan Choinski', seed: null }, winner: 'Frances Tiafoe', score: '4-6, 6-2, 7-5, 6-2' },
  { p1: { name: 'Kyrian Jacquet', seed: null }, p2: { name: 'Alexander Bublik', seed: 10 }, winner: 'Alexander Bublik', score: '6-3, 6-4, 7-6(5)' },
  { p1: { name: 'Jiří Lehečka', seed: 13 }, p2: { name: 'Alex Molčan', seed: null }, winner: 'Jiří Lehečka', score: '6-3, 6-2, 6-4' },
  { p1: { name: 'Jacob Fearnley', seed: null }, p2: { name: 'Jaume Munar', seed: null }, winner: 'Jaume Munar', score: '6-4, 7-6(3), 6-4' },
  { p1: { name: 'Quentin Halys', seed: null }, p2: { name: 'Marcos Giron', seed: null }, winner: 'Marcos Giron', score: '7-6(5), 6-3, 6-4' },
  { p1: { name: 'Valentin Royer', seed: null }, p2: { name: 'Alexander Zverev', seed: 2 }, winner: 'Alexander Zverev', score: '6-1, 6-3, 7-6(3)' },
];

export const WIMBLEDON_2026_EARLY: WMatch[] = [
  ...R128_RAW.map((m, i): WMatch => ({ round: 'R128', slot: i, half: i < 32 ? 'top' : 'bottom', ...m })),
  ...R64_RAW.map((m, i): WMatch => ({ round: 'R64', slot: i, half: i < 16 ? 'top' : 'bottom', ...m })),
];
