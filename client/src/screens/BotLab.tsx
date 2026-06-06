import { useEffect, useState } from "react";

interface TrainingRun {
  at: number;
  source: "cli" | "auto";
  generations: number;
  startWinRate: number;
  bestWinRate: number;
}
interface BotStats {
  weights: Record<string, number> | null;
  totalRuns: number;
  bestWinRate: number;
  latestWinRate: number | null;
  recent: TrainingRun[];
}

export function BotLab({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/bot-stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setFailed(true));
  }, []);

  const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
  const maxBar = stats?.recent.length ? Math.max(...stats.recent.map((r) => r.bestWinRate), 0.01) : 1;

  return (
    <div className="overlay">
      <div className="overlay-card botlab-card">
        <h2>🤖 Bot Lab</h2>
        {failed && <p className="hint">Couldn't load bot stats.</p>}
        {!failed && !stats && <p className="hint">Loading…</p>}
        {stats && (
          <>
            <div className="botlab-kpis">
              <div className="kpi">
                <span className="kpi-val">{pct(stats.latestWinRate)}</span>
                <span className="kpi-label">current skill</span>
              </div>
              <div className="kpi">
                <span className="kpi-val">{pct(stats.bestWinRate)}</span>
                <span className="kpi-label">best ever</span>
              </div>
              <div className="kpi">
                <span className="kpi-val">{stats.totalRuns}</span>
                <span className="kpi-label">training runs</span>
              </div>
            </div>

            <div className="section-label">Improvement over time</div>
            {stats.recent.length === 0 ? (
              <p className="hint">
                No training yet. Bots auto-train a little after each game with bots, or run{" "}
                <code>npm run train-bots</code> for a big session.
              </p>
            ) : (
              <div className="botlab-chart">
                {stats.recent.map((r, i) => (
                  <div
                    key={i}
                    className={`bar ${r.source}`}
                    style={{ height: `${(r.bestWinRate / maxBar) * 100}%` }}
                    title={`${pct(r.bestWinRate)} (${r.source})`}
                  />
                ))}
              </div>
            )}

            {stats.weights && (
              <>
                <div className="section-label" style={{ marginTop: 12 }}>
                  Current brain (tuned weights)
                </div>
                <div className="weights-grid">
                  {Object.entries(stats.weights).map(([k, v]) => (
                    <div key={k} className="weight">
                      <span className="w-name">{k}</span>
                      <span className="w-val">{v.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
