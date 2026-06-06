import { useEffect } from "react";
import { useGame } from "../state";

export function Toast() {
  const { error, clearError } = useGame();
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 3200);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;
  return (
    <div className="toast" role="alert" onClick={clearError}>
      {error}
    </div>
  );
}
