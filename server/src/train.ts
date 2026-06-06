/**
 * Offline bot trainer. Usage: `npm run train-bots [generations]`
 * Hill-climbs the bot weights via self-play, saves the best, and logs the run so the
 * "Bot Lab" view can show improvement over time.
 */
import { trainWeights, DEFAULT_EVAL } from "@dsc/shared";
import { BotLab } from "./botlab.js";

const generations = Number(process.argv[2] ?? 30);
const lab = new BotLab();
const start = lab.current();

console.log(`Training for ${generations} generations from`, start);
const seed = Date.now() & 0xffffffff;
const res = trainWeights(start, generations, DEFAULT_EVAL, seed);

console.log(
  `win rate: ${(res.startWinRate * 100).toFixed(1)}%  ->  ${(res.bestWinRate * 100).toFixed(1)}%`
);

if (res.bestWinRate >= res.startWinRate) {
  lab.setWeights(res.best);
  console.log("Saved improved weights:", res.best);
} else {
  console.log("No improvement; keeping existing weights.");
}

lab.appendRun({
  at: Date.now(),
  source: "cli",
  generations,
  startWinRate: res.startWinRate,
  bestWinRate: res.bestWinRate,
  weights: lab.current(),
});
console.log(`Logged run #${lab.runs().length}.`);
