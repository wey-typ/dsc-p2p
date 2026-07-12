import type { ReactNode } from "react";

/** Fixed bottom navigation bar (social-app style) — the app's single control strip. */
export function BottomBar({ children }: { children: ReactNode }) {
  return <nav className="bottombar">{children}</nav>;
}

export function BBItem({
  icon,
  label,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`bb-item ${active ? "active" : ""} ${danger ? "danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="bb-ico">{icon}</span>
      <span className="bb-lbl">{label}</span>
    </button>
  );
}
