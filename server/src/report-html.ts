import type { BotCampaignReport, LevelGameRecord, Card } from "@dsc/shared";

const SUIT: Record<Card["suit"], { bg: string; ltr: string }> = {
  blue: { bg: "#2f7fd1", ltr: "C" },
  green: { bg: "#2bb38a", ltr: "K" },
  pink: { bg: "#e0589b", ltr: "R" },
  yellow: { bg: "#e0b13a", ltr: "S" },
  sub: { bg: "#1b2733", ltr: "★" },
};

function chip(card: Card): string {
  const m = SUIT[card.suit];
  return `<span class="chip" style="background:${m.bg}">${m.ltr}${card.value}</span>`;
}

function gameBlock(g: LevelGameRecord, names: string[]): string {
  const rows = g.tricks
    .map((t, i) => {
      const plays = t.plays
        .map((p) => `<td>${chip(p.card)} <small>${names[p.seat] ?? "?"}</small></td>`)
        .join("");
      return `<tr><td class="tn">${i + 1}</td>${plays}<td class="win">🏆 ${names[t.winner] ?? "?"}</td></tr>`;
    })
    .join("");
  const badge = g.outcome === "won" ? `<span class="b won">WON</span>` : `<span class="b lost">LOST</span>`;
  const reason = g.failReason ? `<div class="reason">✗ ${escape(g.failReason)}</div>` : "";
  return `
  <details class="game ${g.outcome}">
    <summary>${badge} Pass ${g.pass} — ${g.tasksCleared}/${g.taskTotal} tasks, ${g.tricks.length} tricks</summary>
    ${reason}
    <table class="tricks"><tbody>${rows || '<tr><td colspan="9">No tricks.</td></tr>'}</tbody></table>
  </details>`;
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/** Build a self-contained, scrollable HTML report from a bot campaign run. */
export function buildReportHtml(report: BotCampaignReport, generatedAt: string): string {
  const names = report.playerNames;
  const summaryRows = report.summary
    .map((s) => {
      const w = Math.round(s.winRate * 100);
      return `<tr>
        <td>L${s.level + 1}</td><td>${s.missionName}</td>
        <td>${s.attempts}</td><td class="g">${s.wins}</td><td class="r">${s.failures}</td>
        <td><div class="bar"><div style="width:${w}%"></div></div> ${w}%</td>
      </tr>`;
    })
    .join("");

  const levelSections = report.levels
    .map((level) => {
      const s = report.summary.find((x) => x.level === level)!;
      const blocks = report.games
        .filter((g) => g.level === level)
        .sort((a, b) => a.pass - b.pass)
        .map((g) => gameBlock(g, names))
        .join("");
      return `<section class="level">
        <h3>Level ${level + 1} · ${s.missionName} <span class="lvsum">${s.wins}W / ${s.failures}F</span></h3>
        ${blocks}
      </section>`;
    })
    .join("");

  const t = report.totals;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deep Sea Crew — Bot Report</title>
<style>
  :root{--gold:#f2c14e;--ok:#4fd1a5;--danger:#e7585b;--foam:#e9f6fb;--dim:#a9cdd9;}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Trebuchet MS",Segoe UI,system-ui,sans-serif;color:var(--foam);
    background:radial-gradient(120% 80% at 50% -10%,#1d6c8a,#0e4257 40%,#04141f);min-height:100vh;padding:18px;}
  h1{margin:0 0 4px;font-size:1.6rem}
  .meta{color:var(--dim);font-size:.85rem;margin-bottom:14px}
  .panel{background:rgba(8,43,58,.7);border:1px solid rgba(169,205,217,.18);border-radius:14px;padding:14px;margin-bottom:16px}
  .kpis{display:flex;gap:10px;flex-wrap:wrap}
  .kpi{flex:1;min-width:90px;background:rgba(4,20,31,.4);border-radius:12px;padding:10px;text-align:center}
  .kpi b{display:block;font-size:1.5rem;color:var(--gold)}
  .kpi span{font-size:.66rem;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
  table{width:100%;border-collapse:collapse}
  .summary td,.summary th{padding:6px 8px;border-bottom:1px solid rgba(169,205,217,.12);font-size:.85rem;text-align:left}
  .summary .g{color:var(--ok);font-weight:700}.summary .r{color:var(--danger);font-weight:700}
  .bar{display:inline-block;width:80px;height:8px;background:rgba(255,255,255,.12);border-radius:4px;vertical-align:middle;overflow:hidden}
  .bar>div{height:100%;background:var(--gold)}
  .level{margin-bottom:14px}
  .level h3{font-size:1.05rem;margin:14px 0 6px;border-bottom:1px solid rgba(242,193,78,.3);padding-bottom:4px}
  .lvsum{float:right;font-size:.8rem;color:var(--dim)}
  details.game{background:rgba(4,20,31,.4);border:1px solid rgba(169,205,217,.12);border-radius:10px;margin:6px 0;padding:6px 10px}
  details.game.won{border-left:4px solid var(--ok)}details.game.lost{border-left:4px solid var(--danger)}
  summary{cursor:pointer;font-size:.9rem}
  .b{font-size:.62rem;font-weight:800;padding:2px 6px;border-radius:6px;margin-right:6px}
  .b.won{background:rgba(79,209,165,.2);color:var(--ok)}.b.lost{background:rgba(231,88,91,.2);color:var(--danger)}
  .reason{color:var(--danger);font-size:.8rem;margin:6px 0}
  table.tricks{margin-top:6px}
  table.tricks td{padding:3px 5px;font-size:.78rem;border-bottom:1px solid rgba(169,205,217,.07)}
  table.tricks .tn{color:var(--dim);width:1.6em}
  table.tricks .win{color:var(--gold)}
  .chip{display:inline-block;min-width:1.7em;text-align:center;border-radius:5px;padding:1px 4px;font-weight:800;font-size:.72rem;color:#fff}
  small{color:var(--dim)}
  code{background:rgba(0,0,0,.3);padding:1px 5px;border-radius:4px}
</style></head><body>
  <h1>🤖 Deep Sea Crew — Bot Campaign Report</h1>
  <div class="meta">${report.passes} passes · levels ${report.levels[0]! + 1}–${report.levels.at(-1)! + 1} · ${report.playerCount} bots · generated ${escape(generatedAt)}</div>

  <div class="panel">
    <div class="kpis">
      <div class="kpi"><b>${t.games}</b><span>games</span></div>
      <div class="kpi"><b style="color:var(--ok)">${t.wins}</b><span>wins</span></div>
      <div class="kpi"><b style="color:var(--danger)">${t.failures}</b><span>failures</span></div>
      <div class="kpi"><b>${Math.round((t.wins / Math.max(1, t.games)) * 100)}%</b><span>overall</span></div>
    </div>
  </div>

  <div class="panel">
    <h2 style="margin:0 0 8px;font-size:1.1rem">Per-level summary</h2>
    <table class="summary">
      <thead><tr><th>Lv</th><th>Mission</th><th>Tries</th><th>Wins</th><th>Fails</th><th>Win rate</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2 style="margin:0 0 4px;font-size:1.1rem">Trick-by-trick detail</h2>
    <div class="meta">Tap a game to expand. Chips: <span class="chip" style="background:#2f7fd1">C</span>urrent
      <span class="chip" style="background:#2bb38a">K</span>elp
      <span class="chip" style="background:#e0589b">R</span> coral
      <span class="chip" style="background:#e0b13a">S</span>and
      <span class="chip" style="background:#1b2733">★</span> sub.</div>
    ${levelSections}
  </div>
</body></html>`;
}
