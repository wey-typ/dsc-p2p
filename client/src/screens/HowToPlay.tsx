import { CardView } from "../components/CardView";
import type { Card } from "@dsc/shared";

const LEGEND: { card: Card; label: string }[] = [
  { card: { suit: "blue", value: 7 }, label: "Current" },
  { card: { suit: "green", value: 7 }, label: "Kelp" },
  { card: { suit: "pink", value: 7 }, label: "Coral" },
  { card: { suit: "yellow", value: 7 }, label: "Sand" },
  { card: { suit: "sub", value: 4 }, label: "Sub (trump)" },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay">
      <div className="overlay-card help-card">
        <h2>How to dive 🤿</h2>

        <div className="help-nutshell">
          <strong>In one breath:</strong> it's a <em>team</em> game — you all win or lose
          together. Each round, everyone plays one card; the highest wins the pile ("trick").
          Your job: make sure the right teammate wins the piles that contain their
          <strong> task cards</strong>. Win every task = mission complete.
        </div>

        <p className="help-lead">
          You can't tell anyone your cards — except once per mission with <strong>Sonar</strong>.
        </p>

        <h3>The suits</h3>
        <div className="legend">
          {LEGEND.map((l) => (
            <div key={l.label} className="legend-item">
              <CardView card={l.card} small />
              <span>{l.label}</span>
            </div>
          ))}
        </div>

        <h3>Each trick</h3>
        <ol className="help-list">
          <li>The leader plays a card; everyone must <strong>follow that colour</strong> if they can.</li>
          <li>If you can't follow, play anything — including a <strong>Sub</strong>.</li>
          <li>Highest <strong>Sub</strong> wins; otherwise the highest card of the led colour. The winner leads next.</li>
        </ol>

        <h3>Tasks &amp; ordering</h3>
        <ul className="help-list">
          <li>A task is done when its owner <strong>wins the trick</strong> containing that card.</li>
          <li>If the wrong diver takes a task card, the mission <strong>fails</strong> instantly.</li>
          <li>Watch the badges: <strong>▸ order</strong> (relative sequence), <strong>① #</strong> (exact position),
            <strong> Ω last</strong> (must be completed last).</li>
        </ul>

        <h3>Sonar 📡</h3>
        <p className="help-lead">
          Once per mission, between tricks, reveal one colour card as your
          <strong> highest</strong>, <strong>only</strong>, or <strong>lowest</strong> of that colour.
          No other table talk about your hand!
        </p>

        <button className="btn primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
