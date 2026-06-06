/**
 * Win-every-level report. Usage: `npm run win-report`
 * For 2- and 3-player games, the bots must WIN each level before advancing; heuristic first,
 * then (after 5 failed tries) the solver. Writes a scrollable HTML report.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateWinCampaign } from "@dsc/shared";
import { BotLab } from "./botlab.js";
import { buildWinReportHtml } from "./report-html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lab = new BotLab();

console.log("Running win-every-level campaign for 2 and 3 players (heuristic → solver)…");
const report = simulateWinCampaign({ playerCounts: [2, 3], weights: lab.current() });

const outDir = path.resolve(__dirname, "../../data/reports");
mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, "win-report.html");
writeFileSync(htmlPath, buildWinReportHtml(report, new Date().toString()), "utf8");
writeFileSync(path.join(outDir, "win-report.json"), JSON.stringify(report, null, 2), "utf8");

for (const pc of report.playerCounts) {
  const rows = report.results.filter((r) => r.playerCount === pc);
  const won = rows.filter((r) => r.won).length;
  console.log(`\n${pc} players: ${won}/${rows.length} levels won`);
  for (const r of rows) {
    console.log(
      `  L${r.level + 1} ${r.missionName.padEnd(20)} ${r.won ? "WON " : "FAIL"} via ${r.strategy} (${r.triesUsed} tries)`
    );
  }
}
const t = report.totals;
console.log(`\nTotal: ${t.won}/${t.cells} won (heuristic ${t.viaHeuristic}, solver ${t.viaSolver}, unsolved ${t.unsolved})`);
console.log(`\nReport: ${htmlPath}\nOr while the server runs:  http://<server-ip>:3000/win-report\n`);
