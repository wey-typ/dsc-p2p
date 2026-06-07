/** Per-device settings. Currently: an animations on/off toggle (saved in localStorage). */
export function Settings({
  animOn,
  setAnimOn,
  onClose,
}: {
  animOn: boolean;
  setAnimOn: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="overlay">
      <div className="overlay-card settings-card">
        <h2>⚙ Settings</h2>
        <div className="setting-row">
          <div className="setting-text">
            <strong>Animations</strong>
            <p className="hint">Card &amp; UI motion. On by default — turn it off on this device if you prefer.</p>
          </div>
          <button
            className={`toggle ${animOn ? "on" : ""}`}
            onClick={() => setAnimOn(!animOn)}
            role="switch"
            aria-checked={animOn}
            aria-label="Toggle animations"
          >
            <span className="knob" />
          </button>
        </div>
        <p className="hint">Saved on this device only.</p>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
