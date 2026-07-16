import { useEffect, useState } from "react";

const LIME_GREEN = "#A4C53F";
const NAVY_BLUE = "#1B5A8C";

export default function App() {
  const [status, setStatus] = useState("verification...");

  useEffect(() => {
    fetch("/health/")
      .then((res) => res.json())
      .then((data) => setStatus(data.status === "ok" ? "backend connecte" : "erreur"))
      .catch(() => setStatus("backend injoignable"));
  }, []);

  return (
    <div
      style={{
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: NAVY_BLUE,
      }}
    >
      <div style={{ fontSize: "2rem", color: LIME_GREEN, marginBottom: "0.5rem" }}>
        ◇
      </div>
      <h1 style={{ fontFamily: "Sora, sans-serif" }}>ARBM-MES</h1>
      <p style={{ color: "#666" }}>Adaptive RBM/M&amp;E System — squelette applicatif</p>
      <p>
        Statut backend : <strong>{status}</strong>
      </p>
    </div>
  );
}
