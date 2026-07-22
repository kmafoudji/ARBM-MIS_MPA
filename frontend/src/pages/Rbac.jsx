import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";

/* ── helpers ─────────────────────────────────────────────────────────────── */
function initials(u) {
  // Cas 1 : first_name + last_name séparés
  if (u.first_name && u.last_name) {
    return (u.first_name[0] + u.last_name[0]).toUpperCase();
  }
  // Cas 2 : Entra ID met le nom complet dans first_name (ex. "Samuel Travis")
  if (u.first_name && u.first_name.includes(" ")) {
    const parts = u.first_name.trim().split(" ");
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Cas 3 : juste un prénom ou l'email
  const s = u.first_name || u.last_name || u.email || "?";
  return s.slice(0, 2).toUpperCase();
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const SCOPE_OPTIONS = [
  { value: "global", label: "Global" },
  { value: "fund",   label: "Fund (LLF2)" },
  { value: "hub",    label: "Regional hub" },
  { value: "project",label: "Project" },
  { value: "donor",  label: "Donor" },
];

const ACTION_COLOR = {
  read: "badge-blue", create: "badge-lime", update: "badge-lime",
  delete: "badge-red", submit: "badge-violet", review: "badge-violet",
  validate: "badge-orange", export: "badge", admin: "badge-red",
};

/* ── modal générique ─────────────────────────────────────────────────────── */
function Modal({ title, onClose, children }) {
  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  ONGLET USERS                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */
function TabUsers({ currentUser }) {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", user_type: "internal", auth_method: "sso" });
  const [error, setError] = useState(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-full"],
    queryFn: () => apiFetch("/api/identity/users/"),
  });

  const inviteMutation = useMutation({
    mutationFn: (body) => apiFetch("/api/identity/users/", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries(["users-full"]); qc.invalidateQueries(["users"]); setShowInvite(false); setForm({ email: "", first_name: "", last_name: "", user_type: "internal", auth_method: "sso" }); setError(null); },
    onError: async (e) => { try { const d = await e.response?.json?.(); setError(JSON.stringify(d)); } catch { setError("Error inviting user."); } },
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/identity/users/${id}/toggle_active/`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries(["users-full"]); qc.invalidateQueries(["users"]); },
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <div className="card card-flush">
        <div className="card-header">
          <div>
            <h2 className="card-title">Accounts</h2>
            <div className="card-sub">Provisioned via Microsoft Entra ID</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowInvite(true); setError(null); }}>
            <Icon name="plus" size={14} /> Invite user
          </button>
        </div>

        {isLoading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Email</th>
                <th>Name</th>
                <th>Type</th>
                <th>Auth</th>
                <th>Roles</th>
                <th style={{ width: 100 }}>Joined</th>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.email === currentUser?.email;
                const isSso = u.auth_method === "sso";
                return (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                    <td>
                      <div className="avatar-sm" style={{ background: isMe ? "var(--lime)" : "#1B5A8C" }}>
                        {initials(u)}
                      </div>
                    </td>
                    <td className="text-mono text-xs">
                      {u.email}
                      {isMe && <span className="badge badge-lime" style={{ marginLeft: 6 }}>You</span>}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {u.full_name || <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <span className={`badge ${u.user_type === "internal" ? "badge-violet" : "badge"}`}>
                        {u.user_type === "internal" ? "Internal" : "External"}
                      </span>
                    </td>
                    <td>
                      {isSso ? (
                        <span className="badge badge-blue" style={{ gap: 4, display: "inline-flex", alignItems: "center" }}>
                          <Icon name="cloud" size={11} /> Entra ID
                        </span>
                      ) : (
                        <span className="badge">Local</span>
                      )}
                    </td>
                    <td>
                      {u.role_labels?.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {u.role_labels.map((r) => (
                            <span key={r} className="badge badge-lime" style={{ fontSize: 10 }}>{r}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted text-xs">No role</span>
                      )}
                    </td>
                    <td className="text-mono text-xs">{fmtDate(u.date_joined)}</td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-lime" : "badge-off"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {!isMe && (
                        <button
                          className="btn-square"
                          title={u.is_active ? "Deactivate" : "Reactivate"}
                          aria-label={u.is_active ? "Deactivate" : "Reactivate"}
                          onClick={() => toggleMutation.mutate(u.id)}
                        >
                          <Icon name={u.is_active ? "x" : "check"} size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {showInvite && (
        <Modal title="Invite user" onClose={() => setShowInvite(false)}>
          {error && <div className="notice notice-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="field-row">
            <label className="field-label">Email <span className="req">*</span></label>
            <input className="field-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="first.last@example.org" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-row">
              <label className="field-label">First name</label>
              <input className="field-input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div className="field-row">
              <label className="field-label">Last name</label>
              <input className="field-input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-row">
              <label className="field-label">Type</label>
              <select className="field-select" value={form.user_type} onChange={(e) => set("user_type", e.target.value)}>
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </div>
            <div className="field-row">
              <label className="field-label">Auth method</label>
              <select className="field-select" value={form.auth_method} onChange={(e) => set("auth_method", e.target.value)}>
                <option value="sso">SSO (Entra ID)</option>
                <option value="password">Local password</option>
              </select>
            </div>
          </div>
          <div className="notice notice-info" style={{ marginTop: 8 }}>
            For SSO accounts the user will authenticate via Microsoft Entra ID on their first login — no password needed.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setShowInvite(false)}>
              <Icon name="x" size={13} /> Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!form.email || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate(form)}
            >
              <Icon name="plus" size={13} /> {inviteMutation.isPending ? "Saving..." : "Invite"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  ONGLET ROLES                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */
function TabRoles({ currentUser }) {
  const [expanded, setExpanded] = useState(null);
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch("/api/identity/roles/"),
  });
  const myRoles = currentUser?.roles || [];

  return (
    <div className="card card-flush">
      <div className="card-header">
        <div>
          <h2 className="card-title">Role catalogue</h2>
          <div className="card-sub">11 actors — functional permissions by persona (SFD Module 1)</div>
        </div>
        <span className="badge">{roles.length} roles</span>
      </div>
      {isLoading ? <div className="empty"><span className="spinner" /></div> : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Role</th>
              <th>Description</th>
              <th style={{ width: 120 }}>Permissions</th>
              <th style={{ width: 80 }}>Active users</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const isMyRole = myRoles.includes(r.label);
              const open = expanded === r.id;
              return [
                <tr key={r.id} style={{ background: isMyRole ? "color-mix(in srgb, var(--lime) 6%, transparent)" : undefined }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{r.label}</span>
                      {isMyRole && <span className="badge badge-lime" style={{ fontSize: 10 }}>You</span>}
                      {r.is_system && <span className="badge badge-violet" style={{ fontSize: 10 }}>System</span>}
                    </div>
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{r.description}</td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {r.permissions?.map((a) => (
                        <span key={a} className={`badge ${ACTION_COLOR[a] || "badge"}`} style={{ fontSize: 10, padding: "1px 6px" }}>{a}</span>
                      ))}
                    </div>
                  </td>
                  <td className="text-mono text-xs" style={{ textAlign: "center" }}>{r.assignment_count}</td>
                  <td>
                    <button className="btn-square" onClick={() => setExpanded(open ? null : r.id)} title={open ? "Collapse" : "Expand"}>
                      <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
                    </button>
                  </td>
                </tr>,
                open && (
                  <tr key={`${r.id}-detail`}>
                    <td colSpan={5} style={{ background: "var(--surface-2)", padding: "12px 20px" }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        <strong>Scope: </strong>{r.is_system ? "Global (system)" : "Configurable per assignment"}
                        &nbsp;·&nbsp;<strong>Code: </strong><code>{r.code}</code>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  ONGLET ASSIGNMENTS                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */
function TabAssignments({ currentUser }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [form, setForm] = useState({ user: "", role: "", scope_type: "global", scope_id: "" });
  const [error, setError] = useState(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["role-assignments"],
    queryFn: () => apiFetch("/api/identity/role-assignments/"),
  });
  const { data: users = [] } = useQuery({ queryKey: ["users-full"], queryFn: () => apiFetch("/api/identity/users/") });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch("/api/identity/roles/") });

  const active = assignments.filter((a) => !a.revoked_at);
  const revoked = assignments.filter((a) => a.revoked_at);
  const displayed = showRevoked ? assignments : active;

  const addMutation = useMutation({
    mutationFn: (body) => apiFetch("/api/identity/role-assignments/", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries(["role-assignments"]);
      qc.invalidateQueries(["users-full"]);
      setShowAdd(false);
      setForm({ user: "", role: "", scope_type: "global", scope_id: "" });
      setError(null);
    },
    onError: async (e) => {
      try { const d = await e.response?.json?.(); setError(typeof d === "string" ? d : JSON.stringify(d)); }
      catch { setError("Error assigning role."); }
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/identity/role-assignments/${id}/`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries(["role-assignments"]); qc.invalidateQueries(["users-full"]); },
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const needsScopeId = ["hub", "project", "donor"].includes(form.scope_type);

  return (
    <>
      <div className="card card-flush">
        <div className="card-header">
          <div>
            <h2 className="card-title">Role assignments</h2>
            <div className="card-sub">User × Role × Scope</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
              Show revoked
            </label>
            <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setError(null); }}>
              <Icon name="plus" size={14} /> Assign role
            </button>
          </div>
        </div>

        {isLoading ? <div className="empty"><span className="spinner" /></div>
          : displayed.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No assignments yet</div>
              <p className="text-sm">Use the button above to assign a role to a user.</p>
            </div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Scope</th>
                  <th style={{ width: 110 }}>Assigned</th>
                  <th style={{ width: 110 }}>Revoked</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((a) => (
                  <tr key={a.id} style={{ opacity: a.revoked_at ? 0.5 : 1 }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar-sm" style={{
                          background: a.user_email === currentUser?.email ? "var(--lime)" : "#1B5A8C",
                          flexShrink: 0,
                        }}>
                          {initials({ first_name: a.user_name?.split(" ")[0] || "", last_name: a.user_name?.split(" ").slice(1).join(" ") || "", email: a.user_email })}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>
                            {a.user_name || a.user_email}
                            {a.user_email === currentUser?.email && (
                              <span className="badge badge-lime" style={{ marginLeft: 6, fontSize: 10 }}>You</span>
                            )}
                          </div>
                          <div className="text-mono text-xs text-muted">{a.user_name ? a.user_email : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{a.role_label}</span>
                      {a.role_code === "llfmu_arbm_specialist" && a.user_email === currentUser?.email && (
                        <span className="badge badge-lime" style={{ marginLeft: 6, fontSize: 10 }}>You</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-lime">
                        {a.scope_type_display}{a.scope_id ? ` #${a.scope_id}` : ""}
                      </span>
                    </td>
                    <td className="text-mono text-xs">{fmtDateTime(a.granted_at)}</td>
                    <td className="text-mono text-xs">{a.revoked_at ? fmtDateTime(a.revoked_at) : "—"}</td>
                    <td>
                      {!a.revoked_at && (
                        <button
                          className="btn-square danger"
                          title="Revoke"
                          aria-label="Revoke assignment"
                          onClick={() => window.confirm(`Revoke role "${a.role_label}" for ${a.user_email}?`) && revokeMutation.mutate(a.id)}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}

        {revoked.length > 0 && !showRevoked && (
          <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
            {revoked.length} revoked assignment{revoked.length > 1 ? "s" : ""} hidden —{" "}
            <button className="btn-link" onClick={() => setShowRevoked(true)}>show all</button>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Assign role" onClose={() => setShowAdd(false)}>
          {error && <div className="notice notice-error" style={{ marginBottom: 12, fontSize: 12 }}>{error}</div>}
          <div className="field-row">
            <label className="field-label">User <span className="req">*</span></label>
            <select className="field-select" value={form.user} onChange={(e) => set("user", e.target.value)}>
              <option value="">— Select a user —</option>
              {users.filter((u) => u.is_active).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} (${u.email})` : u.email}</option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label className="field-label">Role <span className="req">*</span></label>
            <select className="field-select" value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="">— Select a role —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: needsScopeId ? "1fr 1fr" : "1fr", gap: 12 }}>
            <div className="field-row">
              <label className="field-label">Scope</label>
              <select className="field-select" value={form.scope_type} onChange={(e) => set("scope_type", e.target.value)}>
                {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {needsScopeId && (
              <div className="field-row">
                <label className="field-label">Scope ID</label>
                <input className="field-input" type="number" value={form.scope_id} onChange={(e) => set("scope_id", e.target.value)} placeholder="e.g. 42" />
              </div>
            )}
          </div>
          <div className="notice notice-info" style={{ marginTop: 8, fontSize: 12 }}>
            The R26 rule (separation of duties) is enforced automatically — a user cannot hold both entry and validation rights on the same scope.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>
              <Icon name="x" size={13} /> Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!form.user || !form.role || addMutation.isPending}
              onClick={() => addMutation.mutate({
                user: parseInt(form.user),
                role: parseInt(form.role),
                scope_type: form.scope_type,
                scope_id: form.scope_id ? parseInt(form.scope_id) : null,
              })}
            >
              <Icon name="check" size={13} /> {addMutation.isPending ? "Saving..." : "Assign"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  PAGE PRINCIPALE                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */
export default function Rbac({ currentUser }) {
  const [tab, setTab] = useState("users");

  const { data: users = [] } = useQuery({ queryKey: ["users-full"], queryFn: () => apiFetch("/api/identity/users/") });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: () => apiFetch("/api/identity/roles/") });
  const { data: assignments = [] } = useQuery({ queryKey: ["role-assignments"], queryFn: () => apiFetch("/api/identity/role-assignments/") });

  const activeAssignments = assignments.filter((a) => !a.revoked_at);

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">System</div>
        <h1 className="view-title">Users &amp; Roles</h1>
        <p className="view-lead">
          Eleven actors across the LLFMU → Regional Hub → PMU → Partners hierarchy.
          Least-privilege and separation of duties (R26) are enforced on every assignment.
        </p>
      </div>

      <div className="tabs">
        <button className={`tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
          Accounts
          <span className="tab-count">{users.length}</span>
        </button>
        <button className={`tab${tab === "assignments" ? " active" : ""}`} onClick={() => setTab("assignments")}>
          Assignments
          <span className="tab-count">{activeAssignments.length}</span>
        </button>
        <button className={`tab${tab === "roles" ? " active" : ""}`} onClick={() => setTab("roles")}>
          Role catalogue
          <span className="tab-count">{roles.length}</span>
        </button>
      </div>

      {tab === "users"       && <TabUsers currentUser={currentUser} />}
      {tab === "assignments" && <TabAssignments currentUser={currentUser} />}
      {tab === "roles"       && <TabRoles currentUser={currentUser} />}
    </div>
  );
}
