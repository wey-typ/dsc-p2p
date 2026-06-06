import type { Card } from "@dsc/shared";

const SUIT_META: Record<Card["suit"], { label: string; glyph: string; cls: string }> = {
  blue: { label: "Current", glyph: "≈", cls: "suit-blue" },
  green: { label: "Kelp", glyph: "❀", cls: "suit-green" },
  pink: { label: "Coral", glyph: "✦", cls: "suit-pink" },
  yellow: { label: "Sand", glyph: "◐", cls: "suit-yellow" },
  sub: { label: "Sub", glyph: "⬡", cls: "suit-sub" },
};

interface Props {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
}

export function CardView({ card, onClick, disabled, selected, small }: Props) {
  const meta = SUIT_META[card.suit];
  const classes = [
    "card",
    meta.cls,
    small ? "card-sm" : "",
    disabled ? "card-disabled" : "",
    selected ? "card-selected" : "",
    onClick && !disabled ? "card-playable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={`${meta.label} ${card.value}`}
    >
      <span className="card-corner card-tl">{card.value}</span>
      <span className="card-glyph">{meta.glyph}</span>
      <span className="card-corner card-br">{card.value}</span>
    </button>
  );
}
