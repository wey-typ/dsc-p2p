import { useEffect, useState } from "react";
import { CardView } from "../components/CardView";
import { describeObjective } from "@dsc/shared";
import type { GameRecord, HistorySummary } from "@dsc/shared";

export function History({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<HistorySummary[] | null>(null);
  const [rec, setRec] = useState<GameRecord | null>(null);
  const [trick, setTrick] = useState(0);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then(setList)
      .catch(() => setList([]));
  }, []);

  function open(id: string) {
    fetch(`/api/history/${id}`)
      .then((r) => r.json())
      .then((g: GameRecord) => {
        setRec(g);
        setTrick(0);
      })
      .catch(() => {});
  }

  const nameOf = (seat: number) => rec?.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;

  return (
    <div className="overlay">
      <div className="overlay-card history-card">
        {!rec ? (
          <>
            <h2>📜 Game History</h2>
            {list === null && <p className="hint">Loading…</p>}
            {list !== null && list.length === 0 && (
              <p className="hint">No games played yet. Finish a mission to log it here.</p>
            )}
            {list && list.length > 0 && (
              <ul className="hist-list">
                {list.map((s) => (
                  <li key={s.id} className={`hist-row ${s.outcome}`} onClick={() => open(s.id)}>
                    <span className={`hist-badge ${s.outcome}`}>{s.outcome === "won" ? "WON" : "LOST"}</span>
                    <span className="hist-main">
                      <strong>{s.missionName}</strong>
                      <small>
                        {s.crewName} · {s.tasksCleared}/{s.tasksTotal} tasks · {s.tricks} tricks ·{" "}
                        {s.players.join(", ")}
                      </small>
                    </span>
                    <span className="hist-arrow">›</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <Review
            rec={rec}
            trick={trick}
            setTrick={setTrick}
            nameOf={nameOf}
            onBack={() => setRec(null)}
          />
        )}
      </div>
    </div>
  );
}

function Review({
  rec,
  trick,
  setTrick,
  nameOf,
  onBack,
}: {
  rec: GameRecord;
  trick: number;
  setTrick: (n: number) => void;
  nameOf: (seat: number) => string;
  onBack: () => void;
}) {
  const t = rec.tricks[trick];
  return (
    <>
      <button className="btn link" onClick={onBack}>
        ← All games
      </button>
      <h2 className={rec.outcome}>
        {rec.outcome === "won" ? "🏆 " : "🌊 "}
        {rec.missionName}
      </h2>
      <p className="hint">
        {rec.crewName} · {new Date(rec.finishedAt).toLocaleString()}
      </p>
      {rec.outcome === "lost" && rec.failReason && <p className="fail-reason">{rec.failReason}</p>}

      {rec.tricks.length === 0 ? (
        <p className="hint">No tricks were played.</p>
      ) : (
        <>
          <div className="section-label">
            Trick {trick + 1} / {rec.tricks.length} — won by{" "}
            <strong className="lt-winner">{nameOf(t!.winner)}</strong>
          </div>
          <div className="trick">
            {t!.plays.map((pl) => (
              <div
                key={`${pl.seat}-${pl.card.suit}-${pl.card.value}`}
                className={`trick-play ${pl.seat === t!.winner ? "lt-won" : ""}`}
              >
                <CardView card={pl.card} small />
                <span className="trick-player">
                  {pl.seat === t!.winner ? "🏆 " : ""}
                  {nameOf(pl.seat)}
                </span>
              </div>
            ))}
          </div>
          <div className="review-nav">
            <button className="btn chip" disabled={trick === 0} onClick={() => setTrick(trick - 1)}>
              ‹ Prev
            </button>
            <button
              className="btn chip"
              disabled={trick >= rec.tricks.length - 1}
              onClick={() => setTrick(trick + 1)}
            >
              Next ›
            </button>
          </div>
        </>
      )}

      <div className="section-label" style={{ marginTop: 12 }}>
        Tasks
      </div>
      <div className="task-row">
        {rec.tasks.map((tk) => (
          <div key={tk.id} className={`task task-${tk.status}`}>
            {tk.card ? (
              <CardView card={tk.card} small />
            ) : (
              <span className="task-objective">
                <span className="task-obj-text">{describeObjective(tk.objective)}</span>
              </span>
            )}
            <span className="task-owner">{nameOf(tk.owner)}</span>
            {tk.status === "done" && <span className="task-check">✓</span>}
          </div>
        ))}
      </div>

      <button className="btn primary" onClick={onBack} style={{ marginTop: 16 }}>
        Back to list
      </button>
    </>
  );
}
