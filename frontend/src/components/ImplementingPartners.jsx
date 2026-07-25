import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { IconEdit, IconPlus, IconDeactivate } from "./ActionIcons.jsx";

function AgencyLogo({ url, name }) {
  if (url) {
    return <img src={url} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} loading="lazy" />;
  }
  const initials = name
    ? name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 24, height: 24, borderRadius: 4, fontSize: 9, fontWeight: 700,
      background: "color-mix(in srgb, var(--lime) 20%, var(--surface))",
      color: "var(--lime-dark, var(--lime))", flexShrink: 0, letterSpacing: "0.02em",
    }}>
      {initials}
    </span>
  );
}

const AGENCY_TYPE_EN = {
  "Gouvernement": "Government",
  "Agence nationale": "National agency",
  "Agence ONU": "UN agency",
  "ONG": "NGO",
  "Secteur prive": "Private sector",
  "Secteur privé": "Private sector",
};
function agencyTypeEn(label) { return AGENCY_TYPE_EN[label] || label; }
import Flag from "./Flag.jsx";

function fmt(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} Bn USD`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(2)} M USD`;
  return `${v.toLocaleString("en-US")} USD`;
}

const ROLE_CHOICES = [
  { value: "lead",        label: "Lead Implementing Agency" },
  { value: "co_executor", label: "Co-executing Agency" },
  { value: "subcontract", label: "Subcontractor / Service provider" },
];

const ROLE_BADGE = {
  lead:        "badge badge-lime",
  co_executor: "badge badge-blue",
  subcontract: "badge",
};

const EMPTY_FORM = { agency: "", role: "lead", allocated_amount_usd: "", notes: "" };

export default function ImplementingPartners({ projectId, envelopeTotal, canEdit }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["partners", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/partners/`),
    staleTime: 30_000,
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ["implementing-agencies"],
    queryFn: () => apiFetch("/api/reference/agencies/"),
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/partners/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners", projectId] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/projects/${projectId}/partners/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners", projectId] });
      setEditId(null);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/projects/${projectId}/partners/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partners", projectId] }),
  });

  function openAdd() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditId(p.id);
    setForm({
      agency: p.agency,
      role: p.role,
      allocated_amount_usd: p.allocated_amount_usd ?? "",
      notes: p.notes ?? "",
    });
    setShowForm(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      agency: Number(form.agency),
      role: form.role,
      allocated_amount_usd: form.allocated_amount_usd !== "" ? form.allocated_amount_usd : null,
      notes: form.notes,
    };
    if (editId) {
      editMutation.mutate({ id: editId, payload });
    } else {
      addMutation.mutate(payload);
    }
  }

  function handleCancel() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  const totalAllocated = partners.reduce((sum, p) => {
    return sum + (p.allocated_amount_usd ? Number(p.allocated_amount_usd) : 0);
  }, 0);

  const hasTotalEnv = envelopeTotal && Number(envelopeTotal) > 0;
  const pctAllocated = hasTotalEnv
    ? Math.min(100, (totalAllocated / Number(envelopeTotal)) * 100).toFixed(1)
    : null;

  const assignedAgencyIds = new Set(partners.map((p) => p.agency));
  const availableAgencies = agencies.filter(
    (a) => a.is_active && (editId ? true : !assignedAgencyIds.has(a.id))
  );

  if (isLoading) {
    return (
      <div className="card-body">
        <span className="spinner" /> Loading partners...
      </div>
    );
  }

  return (
    <div className="card-body">
      {/* Partner table */}
      {partners.length > 0 && (
        <table className="data-table mb-3" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Agency</th>
              <th style={{ textAlign: "left" }}>Type</th>
              <th style={{ textAlign: "left" }}>Role</th>
              <th style={{ textAlign: "right" }}>Allocated (USD)</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="row" style={{ gap: 8, alignItems: "center" }}>
                    <AgencyLogo url={p.agency_logo_url} name={p.agency_name} />
                    {p.agency_country_iso2 && <Flag iso2={p.agency_country_iso2} size={16} />}
                    <strong>{p.agency_name}</strong>
                  </span>
                  {p.notes && (
                    <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                      {p.notes}
                    </div>
                  )}
                </td>
                <td>
                  <span className="text-muted text-sm">{agencyTypeEn(p.agency_type)}</span>
                </td>
                <td>
                  <span className={ROLE_BADGE[p.role] || "badge"}>
                    {p.role_display}
                  </span>
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(p.allocated_amount_usd)}
                </td>
                <td>
                  {canEdit && (
                    <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn-square" title="Edit" onClick={() => openEdit(p)}>
                        <IconEdit />
                      </button>
                      <button className="btn-square danger" title="Remove"
                        onClick={() => {
                          if (window.confirm(`Remove ${p.agency_name} from this project?`))
                            deleteMutation.mutate(p.id);
                        }}>
                        <IconDeactivate />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Budget control bar */}
      {totalAllocated > 0 && (
        <div
          style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-3)",
            padding: "var(--s-3)",
            marginBottom: "var(--s-3)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="text-sm text-muted">Total delegated to partners</span>
            <span className="text-sm" style={{ fontWeight: 600 }}>
              {fmt(totalAllocated)}
              {pctAllocated && (
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                  ({pctAllocated}% of envelope)
                </span>
              )}
            </span>
          </div>
          {pctAllocated && (
            <div
              style={{
                height: 6,
                background: "var(--rule)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pctAllocated}%`,
                  background:
                    Number(pctAllocated) > 100
                      ? "var(--danger, #e11d48)"
                      : "var(--lime, #A4C53F)",
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {partners.length === 0 && !showForm && (
        <p className="text-muted text-sm" style={{ margin: "0 0 var(--s-3)" }}>
          No implementing partner recorded for this project.
        </p>
      )}

      {/* Add / Edit form */}
      {canEdit && showForm && (
        <div
          style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-3)",
            padding: "var(--s-3)",
            marginBottom: "var(--s-3)",
          }}
        >
          <div className="card-sub" style={{ marginBottom: "var(--s-3)" }}>
            {editId ? "Edit partner" : "Add implementing partner"}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-2">
              <div className="field">
                <label className="field-label" htmlFor="partnerAgency">
                  Agency <span className="req">*</span>
                </label>
                <select
                  id="partnerAgency"
                  className="field-select"
                  value={form.agency}
                  onChange={(e) => setForm({ ...form, agency: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {availableAgencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.country_name ? ` — ${a.country_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="partnerRole">
                  Role <span className="req">*</span>
                </label>
                <select
                  id="partnerRole"
                  className="field-select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  required
                >
                  {ROLE_CHOICES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="partnerAmount">
                  Delegated Amount (USD)
                </label>
                <input
                  id="partnerAmount"
                  className="field-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.allocated_amount_usd}
                  onChange={(e) => setForm({ ...form, allocated_amount_usd: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="partnerNotes">
                  Notes
                </label>
                <input
                  id="partnerNotes"
                  className="field-input"
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Scope, components covered…"
                />
              </div>
            </div>

            {(addMutation.isError || editMutation.isError) && (
              <div className="field-error mb-3">
                {JSON.stringify(
                  (addMutation.error || editMutation.error)?.detail
                )}
              </div>
            )}

            <div className="row">
              <button
                className="btn btn-primary btn-sm row"
                style={{ gap: 6 }}
                type="submit"
                disabled={addMutation.isPending || editMutation.isPending}
              >
                {(addMutation.isPending || editMutation.isPending)
                  ? "Saving..."
                  : editId ? "Update" : "Add partner"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {canEdit && !showForm && (
        <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openAdd}>
          <IconPlus size={14} /> Add partner
        </button>
      )}
    </div>
  );
}
