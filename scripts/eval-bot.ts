/**
 * Standalone bot evaluation: win rate across a wide suite of players × levels × seeds.
 * Usage: node_modules/.bin/tsx scripts/eval-bot.ts [gamesPerCell]
 */
import { evaluateWeights, type EvalOptions } from "../shared/src/training.js";
import { DEFAULT_WEIGHTS } from "../shared/src/bots.js";

const gamesPerCell = Number(process.argv[2] ?? 40);
const opts: EvalOptions = {
  players: [2, 3, 4, 5],
  levels: [0, 1, 2, 3, 4],
  gamesPerCell,
  seedBase: 5000,
};

const perCell: string[] = [];
let totalGames = 0;
let totalWins = 0;
for (const n of opts.players) {
  for (const level of opts.levels) {
    const cell: EvalOptions = { ...opts, players: [n], levels: [level] };
    const wr = evaluateWeights(DEFAULT_WEIGHTS, cell);
    perCell.push(`p=${n} L${level}: ${(wr * 100).toFixed(1)}%`);
    totalWins += wr * gamesPerCell;
    totalGames += gamesPerCell;
  }
}
console.log(perCell.join("\n"));
console.log(`TOTAL: ${((totalWins / totalGames) * 100).toFixed(2)}% over ${totalGames} games`);
