import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

const NAVY = "#1B5A8C";
const LIME = "#A4C53F";

export default function ProjectList({ onCreateClick, onProjectClick }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects/"),
  });

  return (
    <div style={{ padding: "2rem", fontFamily: "Inter, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ color: NAVY, fontFamily: "Sora, sans-serif" }}>Projets</h2>
        <button
          onClick={onCreateClick}
          style={{
            background: LIME,
            color: NAVY,
            border: "none",
            borderRadius: 6,
            padding: "0.6rem 1.2rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Nouveau projet (Concept Note)
        </button>
      </div>

      {isLoading && <p>Chargement...</p>}
      {isError && (
        <p style={{ color: "crimson" }}>
          Erreur : {error.detail?.detail || "impossible de charger les projets."}
          {error.message?.includes("401") && " (connectez-vous via /auth/login/)"}
        </p>
      )}

      {data && data.length === 0 && <p>Aucun projet enregistre pour le moment.</p>}

      {data && data.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${NAVY}` }}>
              <th style={{ padding: "0.5rem" }}>Code</th>
              <th style={{ padding: "0.5rem" }}>Nom</th>
              <th style={{ padding: "0.5rem" }}>Pays</th>
              <th style={{ padding: "0.5rem" }}>Secteur</th>
              <th style={{ padding: "0.5rem" }}>Etape</th>
              <th style={{ padding: "0.5rem" }}>Budget</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr
                key={p.id}
                onClick={() => onProjectClick(p.id)}
                style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "0.5rem" }}>{p.code || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{p.name}</td>
                <td style={{ padding: "0.5rem" }}>
                  {p.lead_country_name}
                  {p.country_names?.length > 1 && ` (+${p.country_names.length - 1} autre${p.country_names.length > 2 ? "s" : ""})`}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {p.primary_sector_name}
                  {p.contributing_sector_count > 0 && ` (+${p.contributing_sector_count} contributif${p.contributing_sector_count > 1 ? "s" : ""})`}
                </td>
                <td style={{ padding: "0.5rem" }}>{p.lifecycle_stage_display}</td>
                <td style={{ padding: "0.5rem" }}>
                  {p.budget_amount ? `${p.budget_amount}` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
