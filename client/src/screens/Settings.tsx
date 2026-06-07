/** Per-device settings (saved in localStorage): animations + sound effects toggles. */
export function Settings({
  animOn,
  setAnimOn,
  soundOn,
  setSoundOn,
  onClose,
}: {
  animOn: boolean;
  setAnimOn: (v: boolean) => void;
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
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

        <div className="setting-row">
          <div className="setting-text">
            <strong>Sound effects</strong>
            <p className="hint">Card, trick, task &amp; win/lose cues. On by default.</p>
          </div>
          <button
            className={`toggle ${soundOn ? "on" : ""}`}
            onClick={() => setSoundOn(!soundOn)}
            role="switch"
            aria-checked={soundOn}
            aria-label="Toggle sound effects"
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
