import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "@dsc/shared";

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((data: LeaderboardEntry[]) => setEntries(data))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="overlay">
      <div className="overlay-card leaderboard-card">
        <h2>🏅 Leaderboard</h2>
        {failed && <p className="hint">Couldn't load scores.</p>}
        {!failed && entries === null && <p className="hint">Loading…</p>}
        {entries !== null && entries.length === 0 && (
          <p className="hint">No dives logged yet. Be the first crew!</p>
        )}
        {entries !== null && entries.length > 0 && (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Crew</th>
                <th>Cleared</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.rank}-${e.name}`}>
                  <td className="lb-rank">{e.rank}</td>
                  <td className="lb-name">{e.name}</td>
                  <td>{e.cleared}</td>
                  <td>{Math.round(e.successRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
