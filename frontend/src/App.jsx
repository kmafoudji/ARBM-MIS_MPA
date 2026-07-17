import { useEffect, useState } from "react";
import ProjectList from "./pages/ProjectList.jsx";
import ProjectCreateForm from "./pages/ProjectCreateForm.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";

const LIME_GREEN = "#A4C53F";
const NAVY_BLUE = "#1B5A8C";

export default function App() {
  const [status, setStatus] = useState("verification...");
  const [view, setView] = useState("projects"); // "projects" | "create" | "detail"
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  useEffect(() => {
    fetch("/health/")
      .then((res) => res.json())
      .then((data) => setStatus(data.status === "ok" ? "backend connecte" : "erreur"))
      .catch(() => setStatus("backend injoignable"));
  }, []);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "1rem 2rem",
          borderBottom: `3px solid ${LIME_GREEN}`,
        }}
      >
        <span style={{ color: LIME_GREEN, fontSize: "1.5rem" }}>◇</span>
        <h1 style={{ color: NAVY_BLUE, fontFamily: "Sora, sans-serif", fontSize: "1.4rem", margin: 0 }}>
          ARBM-MES
        </h1>
        <span style={{ color: "#999", fontSize: "0.85rem", marginLeft: "auto" }}>
          Statut backend : <strong>{status}</strong>
        </span>
      </header>

      {view === "projects" && (
        <ProjectList
          onCreateClick={() => setView("create")}
          onProjectClick={(id) => {
            setSelectedProjectId(id);
            setView("detail");
          }}
        />
      )}
      {view === "create" && (
        <ProjectCreateForm
          onCreated={() => setView("projects")}
          onCancel={() => setView("projects")}
        />
      )}
      {view === "detail" && (
        <ProjectDetail projectId={selectedProjectId} onBack={() => setView("projects")} />
      )}
    </div>
  );
}
