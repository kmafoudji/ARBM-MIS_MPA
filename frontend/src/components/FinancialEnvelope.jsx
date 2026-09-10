import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Modal from "./Modal.jsx";
import Select from "./Select";
import { IconEdit, IconPlus, IconDeactivate } from "./ActionIcons.jsx";
import { fmtNum, fmtPct, fmtCurrency } from "../utils.js";

function fmt(n) {
  if (!n) return "—";
  const v = Number(n);
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} Md USD`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(2)} M USD`;
  return `${v.toLocaleString("fr-FR")} USD`;
}

function fmtM(n) {
  if (!n) return "—";
  return `${(Number(n) / 1_000_000).toFixed(1)} M`;
}

export default function FinancialEnvelope({ projectId, canEdit }) {
  const qc = useQueryClient();
  const [showAddSource, setShowAddSource] = useState(false);
  const [editSource, setEditSource] = useState(null);
  const [showAlloc, setShowAlloc] = useState(false);

  const { data: env, isLoading } = useQuery({
    queryKey: ["envelope", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/envelope/`),
  });

  const { data: donors } = useQuery({
    queryKey: ["ref", "donors"],
    queryFn: () => apiFetch("/api/reference/donors/"),
  });
  const { data: currencies } = useQuery({
    queryKey: ["ref", "currencies"],
    queryFn: () => apiFetch("/api/reference/currencies/"),
  });

  const addSource = useMutation({
    mutationFn: (data) =>
      apiFetch(`/api/projects/${projectId}/envelope/sources/`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["envelope", projectId] }); setShowAddSource(false); },
  });

  const patchSource = useMutation({
    mutationFn: ({ id, ...data }) =>
      apiFetch(`/api/projects/${projectId}/envelope/sources/${id}/`, {
        method: "PATCH", body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["envelope", projectId] }); setEditSource(null); },
  });

  const deleteSource = useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/projects/${projectId}/envelope/sources/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelope", projectId] }),
  });

  const upsertAlloc = useMutation({
    mutationFn: (data) =>
      apiFetch(`/api/projects/${projectId}/envelope/allocations/`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["envelope", projectId] }); },
  });

  if (isLoading) return <div className="loading-wrap"><span className="spinner" /> Loading envelope...</div>;
  if (!env) return null;

  const total = Number(env.total_amount_usd || 0);
  const sources = env.financing_sources || [];
  const allocs = env.component_allocations || [];
  const allocTotal = allocs.reduce((s, a) => s + Number(a.amount_usd), 0);
  const unallocated = total - allocTotal;

  return (
    <div>
      {/* KPI total */}
      <div className="envelope-grid">
        <div className="envelope-total">
          <div className="envelope-total-label">Enveloppe totale LLF2</div>
          <div className="envelope-total-amount">{fmt(total)}</div>
          <div className="envelope-total-sub">{sources.length} financing source{sources.length > 1 ? "s" : ""}</div>
        </div>

        {/* Répartition par source */}
        <div className="card" style={{ padding: "var(--s-3)" }}>
          <div className="card-title mb-2" style={{ fontSize: 13 }}>Distribution by Source</div>
          {sources.length === 0 && <span className="text-muted text-xs">No source entered.</span>}
          {sources.map((s) => {
            const pct = total > 0 ? (Number(s.amount_usd) / total) * 100 : 0;
            return (
              <div key={s.id} style={{ marginBottom: 8 }}>
                <div className="row row-between" style={{ marginBottom: 2 }}>
                  <span className="text-xs">{s.source_display} · {s.instrument_display}</span>
                  <span className="text-mono text-xs">{fmtM(s.amount_usd)} M</span>
                </div>
                <div className="alloc-bar-wrap">
                  <div className="alloc-bar" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tableau des lignes de financement */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h3 className="card-title">Financing Sources</h3>
            <div className="card-sub">
              IsDB Ordinary Capital · LLF · Government · Co-financing
            </div>
          </div>
          {canEdit && (
            <button className="btn btn-primary btn-sm btn-icon" onClick={() => setShowAddSource(true)}>
              <IconPlus size={13} /> Add row
            </button>
          )}
        </div>

        {sources.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No financing source</div>
            <p className="text-sm">LLF2 blended finance combines IsDB loans, donor grants and government gouvernementales.</p>
          </div>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Instrument</th>
                <th>Donor</th>
                <th>Label</th>
                <th style={{ width: 140 }}>Original Amount</th>
                <th style={{ width: 130 }}>Equiv. USD</th>
                {canEdit && <th style={{ width: 70 }} />}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td><span className="badge">{s.source_display}</span></td>
                  <td><span className="badge">{s.instrument_display}</span></td>
                  <td>{s.donor_name || <span className="text-muted text-xs">—</span>}</td>
                  <td className="text-muted">{s.label || "—"}</td>
                  <td className="text-mono text-xs">
                    {fmtNum(s.amount)} {s.currency_code}
                  </td>
                  <td className="text-mono text-xs" style={{ fontWeight: 600 }}>
                    {fmt(s.amount_usd)}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="row-actions">
                        <button className="btn-square" title="Edit"
                          onClick={() => setEditSource({ ...s })}>
                          <IconEdit />
                        </button>
                        <button className="btn-square danger" title="Delete"
                          onClick={() => deleteSource.mutate(s.id)}>
                          <IconDeactivate />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--paper)" }}>
                <td colSpan={canEdit ? 5 : 5} style={{ fontWeight: 600, fontSize: 12 }}>
                  Total envelope
                </td>
                <td className="text-mono" style={{ fontWeight: 700, color: "var(--lime-dark, var(--lime))" }}>
                  {fmt(total)}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table></div>
        )}
      </div>

      {/* Allocation par composante */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h3 className="card-title">Allocation by Component <span className="badge" style={{ marginLeft: 8 }}>Indicative</span></h3>
            <div className="card-sub">Works · Consulting · Goods · Training · Operations — detail in Module 9</div>
          </div>
          {canEdit && (
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowAlloc(true)}>
              <IconEdit size={13} /> Edit
            </button>
          )}
        </div>

        {allocs.length === 0 ? (
          <div className="empty" style={{ padding: "var(--s-4)" }}>
            <span className="text-muted text-xs">No allocation entered. Optional at this stage.</span>
          </div>
        ) : (
          <div style={{ padding: "var(--s-4)" }}>
            {allocs.map((a) => {
              const pct = total > 0 ? (Number(a.amount_usd) / total) * 100 : 0;
              return (
                <div key={a.id} style={{ marginBottom: 12 }}>
                  <div className="row row-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{a.component_display}</span>
                    <span className="text-mono text-xs">{fmt(a.amount_usd)} · {pct.toFixed(1)} %</span>
                  </div>
                  <div className="alloc-bar-wrap">
                    <div className="alloc-bar" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {unallocated > 0 && (
              <div className="notice notice-warn mt-2" style={{ fontSize: 11 }}>
                {fmt(unallocated)} unallocated ({((unallocated / total) * 100).toFixed(1)}% of the envelope).
              </div>
            )}
          </div>
        )}
      </div>

      {/* Total général — pied de card */}
      {total > 0 && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderTop: "2px solid var(--rule)",
          background: "var(--paper)",
        }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
            Total envelope
          </span>
          <span className="text-mono" style={{ fontWeight: 700, color: "var(--lime-dark, var(--lime))" }}>
            {fmt(total)}
          </span>
        </div>
      )}

      {/* Modal : ajouter / éditer source */}
      {(showAddSource || editSource) && (
        <SourceModal
          initial={editSource}
          env={env}
          donors={donors || []}
          currencies={currencies || []}
          onClose={() => { setShowAddSource(false); setEditSource(null); }}
          onSave={(data) => {
            if (editSource) patchSource.mutate({ id: editSource.id, ...data });
            else addSource.mutate(data);
          }}
          pending={addSource.isPending || patchSource.isPending}
          error={addSource.error || patchSource.error}
        />
      )}

      {/* Modal : allocation par composante */}
      {showAlloc && (
        <AllocModal
          env={env}
          total={total}
          onClose={() => setShowAlloc(false)}
          onSave={(component, amount_usd) => upsertAlloc.mutate({ component, amount_usd })}
          pending={upsertAlloc.isPending}
        />
      )}
    </div>
  );
}

/* ── Formulaire source ──────────────────────────────────────────────────── */
function SourceModal({ initial, env, donors, currencies, onClose, onSave, pending, error }) {
  const [form, setForm] = useState({
    source: initial?.source || "",
    instrument: initial?.instrument || "",
    donor: initial?.donor || "",
    amount: initial?.amount || "",
    currency: initial?.currency || "USD",
    amount_usd: initial?.amount_usd || "",
    exchange_rate_date: initial?.exchange_rate_date || "",
    label: initial?.label || "",
  });

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function handleSave() {
    const payload = {
      source: form.source,
      instrument: form.instrument,
      donor: form.donor || null,
      amount: form.amount,
      currency: form.currency,
      amount_usd: form.amount_usd,
      exchange_rate_date: form.exchange_rate_date || null,
      label: form.label,
    };
    onSave(payload);
  }

  const isEdit = Boolean(initial);

  return (
    <Modal
      title={isEdit ? "Edit financing line" : "Add financing source"}
      subtitle="SF-6 · LLF2 Financial Envelope"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={pending || !form.source || !form.instrument || !form.amount_usd}>
            {pending ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="fe-source">Financing Source <span className="req">*</span></label>
        <Select
          id="fe-source"
          options={(env.source_choices || []).map((c) => ({ value: c.value, label: c.label }))}
          value={form.source}
          onChange={(v) => set("source", v)}
          placeholder="— Select —"
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="fe-instrument">Instrument Type <span className="req">*</span></label>
        <Select
          id="fe-instrument"
          options={(env.instrument_choices || []).map((c) => ({ value: c.value, label: c.label }))}
          value={form.instrument}
          onChange={(v) => set("instrument", v)}
          placeholder="— Select —"
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="fe-donor">Associated Donor</label>
        <Select
          id="fe-donor"
          options={donors.map((d) => ({ value: String(d.id), label: `${d.short_name} — ${d.name}` }))}
          value={form.donor}
          onChange={(v) => set("donor", v)}
          placeholder="— None (optional) —"
        />
        <span className="field-help">Optional for IsDB Ordinary Capital lines.</span>
      </div>

      <div className="row" style={{ gap: "var(--s-3)" }}>
        <div className="field" style={{ flex: 2 }}>
          <label className="field-label">Original Amount <span className="req">*</span></label>
          <input className="field-input" type="number" value={form.amount}
            onChange={(e) => set("amount", e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label" htmlFor="fe-currency">Currency</label>
          <Select
            id="fe-currency"
            options={currencies.map((c) => ({ value: c.code, label: c.code }))}
            value={form.currency}
            onChange={(v) => set("currency", v)}
            required
          />
        </div>
      </div>

      <div className="row" style={{ gap: "var(--s-3)" }}>
        <div className="field" style={{ flex: 2 }}>
          <label className="field-label">USD Equivalent <span className="req">*</span></label>
          <input className="field-input" type="number" value={form.amount_usd}
            onChange={(e) => set("amount_usd", e.target.value)} />
          <span className="field-help">
            Enter manually with the reference date. An exchange-rate feed will be connected later.
          </span>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Exchange Rate Date</label>
          <input className="field-input" type="date" value={form.exchange_rate_date}
            onChange={(e) => set("exchange_rate_date", e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Free Label</label>
        <input className="field-input" value={form.label} placeholder="e.g. IsDB Loan tranche 1"
          onChange={(e) => set("label", e.target.value)} />
      </div>

      {error && (
        <div className="field-error">
          {error?.detail || "Registration failed."}
        </div>
      )}
    </Modal>
  );
}

/* ── Allocation par composante ──────────────────────────────────────────── */
function AllocModal({ env, total, onClose, onSave, pending }) {
  const existing = Object.fromEntries(
    (env.component_allocations || []).map((a) => [a.component, a.amount_usd])
  );
  const [vals, setVals] = useState(existing);

  return (
    <Modal
      title="Allocation by Component"
      subtitle="Indicative — detail in Module 9"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </>
      }
    >
      <p className="text-sm text-muted mb-3">
        Enter the indicative USD amount for each component.
        The total must not exceed the overall envelope of <strong>{fmt(total)}</strong>.
      </p>
      {(env.component_choices || []).map((c) => (
        <div className="field" key={c.value}>
          <label className="field-label">{c.label}</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="field-input text-mono"
              type="number"
              value={vals[c.value] || ""}
              placeholder="0"
              onChange={(e) => setVals((v) => ({ ...v, [c.value]: e.target.value }))}
            />
            <button
              className="btn btn-sm btn-primary"
              disabled={pending || !vals[c.value]}
              onClick={() => onSave(c.value, vals[c.value])}
            >
              {pending ? "..." : "Save"}
            </button>
          </div>
        </div>
      ))}

      {/* Total alloué */}
      {(() => {
        const allocTotal = Object.values(vals).reduce((s, v) => s + Number(v || 0), 0);
        const over = allocTotal > total;
        return (
          <div style={{
            marginTop: 16, paddingTop: 12,
            borderTop: "2px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ color: "var(--text-muted)" }}>Total allocated</span>
            <span style={{ color: over ? "var(--rose)" : "var(--lime-darker)" }}>
              {fmt(allocTotal)} / {fmt(total)} USD
              {over && <span style={{ marginLeft: 8, fontSize: 11 }}>⚠ Exceeds envelope</span>}
            </span>
          </div>
        );
      })()}
    </Modal>
  );
}
