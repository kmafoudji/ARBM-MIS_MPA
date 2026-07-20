import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";

export default function Rbac() {
  const [tab, setTab] = useState("roles");

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch("/api/identity/roles/") });
  const { data: assignments } = useQuery({
    queryKey: ["role-assignments"],
    queryFn: () => apiFetch("/api/identity/role-assignments/"),
  });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => apiFetch("/api/identity/users/") });

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">System</div>
        <h1 className="view-title">Users &amp; Roles</h1>
        <p className="view-lead">
          Onze acteurs de la hierarchie LLFMU → Hub regional → PMU → Partenaires. Le principe du
          moindre privilege et la separation des taches sont appliques automatiquement a toute
          attribution.
        </p>
      </div>

      <div className="tabs">
        <button className={`tab${tab === "roles" ? " active" : ""}`} onClick={() => setTab("roles")}>
          Roles
          {tab === "roles" && roles && <span className="tab-count">{roles.length}</span>}
        </button>
        <button
          className={`tab${tab === "assignments" ? " active" : ""}`}
          onClick={() => setTab("assignments")}
        >
          Attributions
          {tab === "assignments" && assignments && <span className="tab-count">{assignments.length}</span>}
        </button>
        <button className={`tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
          Comptes
          {tab === "users" && users && <span className="tab-count">{users.length}</span>}
        </button>
      </div>

      {tab === "roles" && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Actors</h2>
              <div className="card-sub">Functional Permissions by Persona</div>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 240 }}>Actor</th>
                <th>System Role</th>
                <th style={{ width: 90 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {roles?.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.label}</td>
                  <td className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {r.description}
                  </td>
                  <td>
                    {r.is_system ? (
                      <span className="badge badge-violet">System</span>
                    ) : (
                      <span className="badge">Business Role</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "assignments" && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Active Assignments</h2>
              <div className="card-sub">User × Role × Scope</div>
            </div>
          </div>
          {assignments?.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No assignment</div>
              <p className="text-sm">
                Les attributions se font pour l'instant via la console d'administration Django.
              </p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Scope</th>
                  <th style={{ width: 120 }}>Assigned on</th>
                </tr>
              </thead>
              <tbody>
                {assignments?.map((a) => (
                  <tr key={a.id}>
                    <td>{a.user_email}</td>
                    <td style={{ fontWeight: 500 }}>{a.role_label}</td>
                    <td>
                      <span className="badge badge-lime">
                        {a.scope_type_display}
                        {a.scope_id ? ` #${a.scope_id}` : ""}
                      </span>
                    </td>
                    <td className="text-mono text-xs">
                      {new Date(a.granted_at).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Accounts</h2>
              <div className="card-sub">Provisioned via Microsoft Entra ID</div>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td className="text-mono text-xs">{u.email}</td>
                  <td>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
