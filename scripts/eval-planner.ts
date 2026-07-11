/**
 * Evaluate the solver-backed BotPlanner across players × levels × seeds.
 * Usage: node_modules/.bin/tsx scripts/eval-planner.ts [gamesPerCell] [nodes]
 */
import type { Player } from "../shared/src/types.js";
import { createGame, playCard } from "../shared/src/game.js";
import { buildMissionForLevel } from "../shared/src/missions.js";
import { mulberry32 } from "../shared/src/rng.js";
import { BotPlanner } from "../shared/src/planner.js";

const gamesPerCell = Number(process.argv[2] ?? 20);
const nodes = Number(process.argv[3] ?? 20000);

const bots = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));

let totalGames = 0;
let totalWins = 0;
const t0 = performance.now();
for (const n of [2, 3, 4, 5]) {
  for (const level of [0, 1, 2, 3, 4]) {
    let wins = 0;
    for (let g = 0; g < gamesPerCell; g++) {
      const seed = 5000 + g * 101 + level * 17 + n * 7;
      let state = createGame(bots(n), buildMissionForLevel(n, level, mulberry32(seed)), mulberry32(seed + 7));
      const planner = new BotPlanner({ nodes, maxAttempts: 2 });
      for (let i = 0; i < 80 && state.phase === "playing"; i++) {
        state = playCard(state, state.turn, planner.choose(state, state.turn));
      }
      if (state.phase === "won") wins++;
    }
    console.log(`p=${n} L${level}: ${((wins / gamesPerCell) * 100).toFixed(1)}%`);
    totalWins += wins;
    totalGames += gamesPerCell;
  }
}
console.log(
  `TOTAL: ${((totalWins / totalGames) * 100).toFixed(2)}% over ${totalGames} games in ${((performance.now() - t0) / 1000).toFixed(1)}s`
);
