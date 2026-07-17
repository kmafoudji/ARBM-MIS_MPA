import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { COLOR, FONT } from "../theme";

export default function Rbac() {
  const [tab, setTab] = useState("roles");

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch("/api/identity/roles/"),
  });
  const { data: assignments } = useQuery({
    queryKey: ["role-assignments"],
    queryFn: () => apiFetch("/api/identity/role-assignments/"),
  });

  return (
    <div style={{ padding: "2rem", fontFamily: FONT.body }}>
      <h2 style={{ color: COLOR.navy, fontFamily: FONT.display }}>RBAC & utilisateurs</h2>
      <p style={{ color: COLOR.muted, marginTop: 0 }}>
        11 acteurs (SFD Module 1). Separation des taches R26/RG-3.5 appliquee automatiquement
        a toute nouvelle attribution.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: `1px solid ${COLOR.rule}` }}>
        {[
          ["roles", "Roles (acteurs)"],
          ["assignments", "Attributions"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === key ? `2px solid ${COLOR.lime}` : "2px solid transparent",
              color: tab === key ? COLOR.navy : COLOR.muted,
              fontWeight: tab === key ? 600 : 500,
              padding: "0.6rem 0.9rem",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "roles" && (
        <table style={{ width: "100%", borderCollapse: "collapse", background: COLOR.paper }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${COLOR.navy}` }}>
              <th style={{ padding: "0.6rem" }}>Acteur</th>
              <th style={{ padding: "0.6rem" }}>Description</th>
              <th style={{ padding: "0.6rem" }}>Systeme</th>
            </tr>
          </thead>
          <tbody>
            {roles?.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${COLOR.rule}` }}>
                <td style={{ padding: "0.6rem", fontWeight: 600, color: COLOR.navy }}>{r.label}</td>
                <td style={{ padding: "0.6rem", color: COLOR.inkSoft, fontSize: "0.85rem" }}>
                  {r.description}
                </td>
                <td style={{ padding: "0.6rem" }}>{r.is_system ? "Oui" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "assignments" && (
        <table style={{ width: "100%", borderCollapse: "collapse", background: COLOR.paper }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `2px solid ${COLOR.navy}` }}>
              <th style={{ padding: "0.6rem" }}>Utilisateur</th>
              <th style={{ padding: "0.6rem" }}>Role</th>
              <th style={{ padding: "0.6rem" }}>Perimetre</th>
              <th style={{ padding: "0.6rem" }}>Attribue le</th>
            </tr>
          </thead>
          <tbody>
            {assignments?.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "0.6rem", color: COLOR.muted }}>
                  Aucune attribution — a faire via l'admin Django pour l'instant.
                </td>
              </tr>
            )}
            {assignments?.map((a) => (
              <tr key={a.id} style={{ borderBottom: `1px solid ${COLOR.rule}` }}>
                <td style={{ padding: "0.6rem" }}>{a.user_email}</td>
                <td style={{ padding: "0.6rem" }}>{a.role_label}</td>
                <td style={{ padding: "0.6rem" }}>
                  {a.scope_type_display}
                  {a.scope_id ? ` #${a.scope_id}` : ""}
                </td>
                <td style={{ padding: "0.6rem" }}>{new Date(a.granted_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
