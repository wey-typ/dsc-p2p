import { missionName, missionNotes, missionTaskCount, MAX_LEVEL } from "@dsc/shared";

/** Static guide to every level's name, task count, and ordering rules/restrictions. */
export function LevelGuide({
  onClose,
  onPick,
  currentLevel,
  extension = true,
}: {
  onClose: () => void;
  onPick?: (level: number) => void;
  currentLevel?: number;
  extension?: boolean;
}) {
  const levels = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => i);
  return (
    <div className="overlay">
      <div className="overlay-card guide-card">
        <h2>🗺️ Level Guide</h2>
        <p className="hint">Difficulty rises each level. {onPick ? "Tap a level to select it." : ""}</p>
        <ul className="guide-list">
          {levels.map((lv) => (
            <li
              key={lv}
              className={`guide-row ${lv === currentLevel ? "current" : ""} ${onPick ? "pickable" : ""}`}
              onClick={onPick ? () => onPick(lv) : undefined}
            >
              <div className="guide-head">
                <span className="guide-num">L{lv + 1}</span>
                <strong>{missionName(lv)}</strong>
                <span className="guide-tasks">{missionTaskCount(lv)} tasks</span>
                {lv === currentLevel && <span className="tag you">selected</span>}
              </div>
              <ul className="guide-notes">
                {missionNotes(lv, extension).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
