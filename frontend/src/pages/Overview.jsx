import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { COLOR, FONT } from "../theme";

function StatCard({ label, value }) {
  return (
    <div
      style={{
        background: COLOR.paper,
        border: `1px solid ${COLOR.rule}`,
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        minWidth: 160,
      }}
    >
      <div style={{ color: COLOR.muted, fontSize: "0.8rem", marginBottom: "0.35rem" }}>{label}</div>
      <div style={{ color: COLOR.navy, fontFamily: FONT.display, fontSize: "1.8rem", fontWeight: 600 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function Overview({ user }) {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch("/api/projects/"),
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/identity/users/"),
  });
  const { data: countries } = useQuery({
    queryKey: ["countries"],
    queryFn: () => apiFetch("/api/reference/countries/"),
  });

  return (
    <div style={{ padding: "2rem", fontFamily: FONT.body }}>
      <h2 style={{ color: COLOR.navy, fontFamily: FONT.display, marginBottom: "0.25rem" }}>
        Bonjour{user?.name ? `, ${user.name}` : ""}
      </h2>
      <p style={{ color: COLOR.muted, marginTop: 0 }}>
        Portefeuille LLF2 — apercu general.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        <StatCard label="Projets enregistres" value={projects?.length} />
        <StatCard label="Utilisateurs" value={users?.length} />
        <StatCard label="Pays references" value={countries?.length} />
      </div>
    </div>
  );
}
