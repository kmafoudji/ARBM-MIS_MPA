/**
 * RefreshBar — composant réutilisable
 * Affiche la dernière mise à jour + bouton refresh manuel
 */
import { useEffect, useState } from "react";
import Icon from "./Icon";

export default function RefreshBar({ dataUpdatedAt, isFetching, onRefresh }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    function update() {
      if (!dataUpdatedAt) return;
      const diff = Math.floor((Date.now() - dataUpdatedAt) / 1000);
      if (diff < 10)  return setElapsed("just now");
      if (diff < 60)  return setElapsed(`${diff}s ago`);
      if (diff < 3600) return setElapsed(`${Math.floor(diff / 60)}m ago`);
      setElapsed(`${Math.floor(diff / 3600)}h ago`);
    }
    update();
    const t = setInterval(update, 10_000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontSize: 11, color: "var(--subtle)",
    }}>
      {isFetching ? (
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="spinner" style={{ width: 12, height: 12 }} />
          Refreshing…
        </span>
      ) : (
        <span>Updated {elapsed}</span>
      )}
      <button
        onClick={onRefresh}
        disabled={isFetching}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 10px", borderRadius: 99,
          border: "1px solid var(--rule)", background: "var(--paper)",
          fontSize: 11, color: "var(--muted)", cursor: "pointer",
          opacity: isFetching ? 0.5 : 1, fontFamily: "inherit",
        }}>
        <Icon name="refresh" size={11} /> Refresh
      </button>
    </div>
  );
}

/**
 * SkeletonRow — ligne placeholder animée pendant le chargement
 */
export function SkeletonRow({ cols = 5 }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--rule)" }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "12px" }}>
          <div style={{
            height: 12, borderRadius: 6,
            background: "linear-gradient(90deg, var(--rule) 25%, var(--surface-2) 50%, var(--rule) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            width: i === 0 ? "80%" : i === cols - 1 ? "60%" : "70%",
          }} />
        </td>
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </tr>
  );
}

export function SkeletonCard({ height = 80 }) {
  return (
    <div style={{
      height, borderRadius: 12,
      background: "linear-gradient(90deg, var(--rule) 25%, var(--surface-2) 50%, var(--rule) 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
    }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
