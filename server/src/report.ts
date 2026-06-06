/**
 * Bot campaign report generator.
 * Usage: `npm run bot-report [players=4] [passes=5]`
 * Plays every level in order `passes` times (looping back to level 1 after the last),
 * recording every trick and per-level failures, then writes a scrollable HTML report.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateBotCampaign } from "@dsc/shared";
import { BotLab } from "./botlab.js";
import { buildReportHtml } from "./report-html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Default to 3 bots — the count at which the cooperative bots play best (most
// representative of their real skill). Override: `npm run bot-report 4 5`.
const players = Number(process.argv[2] ?? 3);
const passes = Number(process.argv[3] ?? 5);

const lab = new BotLab();
console.log(`Simulating ${passes} passes through all levels with ${players} bots…`);
const report = simulateBotCampaign({ passes, players, weights: lab.current() });

const outDir = path.resolve(__dirname, "../../data/reports");
mkdirSync(outDir, { recursive: true });
const html = buildReportHtml(report, new Date().toString());
const htmlPath = path.join(outDir, "bot-report.html");
const jsonPath = path.join(outDir, "bot-report.json");
writeFileSync(htmlPath, html, "utf8");
writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

console.log("\nPer-level results:");
for (const s of report.summary) {
  console.log(`  L${s.level + 1} ${s.missionName.padEnd(20)} ${s.wins}W / ${s.failures}F  (${Math.round(s.winRate * 100)}%)`);
}
console.log(`\nTotals: ${report.totals.wins} wins / ${report.totals.failures} failures of ${report.totals.games} games`);
console.log(`\nReport written to:\n  ${htmlPath}`);
console.log("View it in a browser, or while the server runs open:  http://<server-ip>:3000/bot-report\n");
