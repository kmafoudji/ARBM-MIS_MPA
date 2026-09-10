/**
 * EvidencePanel — SF-10
 * Upload et gestion des preuves liées à un ResultsData.
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon";
import Select from "./Select";

const TYPE_ICONS = {
  photo: "image", pdf: "file-text", survey: "clipboard",
  report: "bar-chart-2", video: "play", other: "folder",
};

const STATUS_CONFIG = {
  pending:  { color: "var(--orange)", bg: "var(--sec-infra-pale)", label: "Pending" },
  verified: { color: "var(--lime)", bg: "var(--lime-pale)", label: "Verified" },
  rejected: { color: "var(--rose)", bg: "var(--rose-soft)", label: "Rejected" },
};

export default function EvidencePanel({ projectId, rowId, rdId, onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [form, setForm] = useState({ title: "", description: "", evidence_type: "pdf", external_url: "" });
  const [file, setFile] = useState(null);
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState("");
  const [verifyId, setVerifyId] = useState(null);

  const qKey = ["evidence", projectId, rowId, rdId];
  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn:  () => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/results/${rdId}/evidence/`),
  });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("title",         form.title);
      fd.append("description",   form.description);
      fd.append("evidence_type", form.evidence_type);
      fd.append("external_url",  form.external_url);
      if (file) fd.append("file", file);
      return fetch(`/api/projects/${projectId}/logframe/${rowId}/results/${rdId}/evidence/`, {
        method: "POST", body: fd, credentials: "include",
      }).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setAdding(false);
      setForm({ title: "", description: "", evidence_type: "pdf", external_url: "" });
      setFile(null);
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ evId, action, notes }) => apiFetch(
      `/api/projects/${projectId}/logframe/${rowId}/results/${rdId}/evidence/${evId}/`,
      { method: "PATCH", body: JSON.stringify({ action, notes }) }
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qKey }); setVerifyId(null); setNotes(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (evId) => apiFetch(
      `/api/projects/${projectId}/logframe/${rowId}/results/${rdId}/evidence/${evId}/`,
      { method: "DELETE" }
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  });

  const evidences = data?.results || [];

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 10, padding: 16, marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink-soft)" }}>
          <Icon name="folder" size={13} style={{ marginRight: 6, color: "var(--lime)" }} />
          Evidence & Supporting Documents
          {evidences.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, background: "var(--lime-pale)", color: "var(--lime-darker)", padding: "1px 8px", borderRadius: 99 }}>
              {evidences.length}
            </span>
          )}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {!adding && (
            <button className="btn btn-ghost btn-sm row" style={{ gap: 5, fontSize: 11 }} onClick={() => setAdding(true)}>
              <Icon name="plus" size={12} /> Add evidence
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <Icon name="x" size={12} />
          </button>
        </div>
      </div>

      {/* Liste des preuves */}
      {isLoading && <span className="spinner" />}
      {evidences.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: "var(--subtle)", margin: 0, fontStyle: "italic" }}>No evidence attached yet.</p>
      )}
      {evidences.map(ev => {
        const sc = STATUS_CONFIG[ev.status] || STATUS_CONFIG.pending;
        return (
          <div key={ev.id} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: 1 }}>
                <Icon name={TYPE_ICONS[ev.evidence_type] || "folder"} size={16} style={{ color: "var(--subtle)", flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink)" }}>{ev.title}</div>
                  {ev.description && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{ev.description}</div>}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: sc.bg, color: sc.color }}>
                      {sc.label}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--subtle)" }}>{ev.evidence_type_display}</span>
                    {ev.uploaded_by && <span style={{ fontSize: 10, color: "var(--subtle)" }}>by {ev.uploaded_by}</span>}
                    {ev.file_url && (
                      <a href={ev.file_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "var(--blue)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Icon name="download" size={10} /> Download
                      </a>
                    )}
                    {ev.external_url && (
                      <a href={ev.external_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "var(--blue)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Icon name="globe" size={10} /> Open link
                      </a>
                    )}
                  </div>
                  {/* Notes vérification */}
                  {ev.notes && (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 4 }}>
                      Note: {ev.notes}
                    </div>
                  )}
                </div>
              </div>
              {/* Actions vérification */}
              {ev.status === "pending" && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {verifyId === ev.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input className="field-input" style={{ fontSize: 11, height: 28, width: 140 }}
                        placeholder="Verification notes…" value={notes}
                        onChange={e => setNotes(e.target.value)} />
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--lime)", padding: "2px 8px", fontSize: 11 }}
                        onClick={() => actionMutation.mutate({ evId: ev.id, action: "verify", notes })}>
                        ✓ Verify
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: "var(--rose)", padding: "2px 8px", fontSize: 11 }}
                        onClick={() => actionMutation.mutate({ evId: ev.id, action: "reject", notes })}>
                        ✗ Reject
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setVerifyId(null)}><Icon name="x" size={11} /></button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm row" style={{ gap: 4, fontSize: 11 }}
                      onClick={() => setVerifyId(ev.id)}>
                      <Icon name="check" size={11} /> Review
                    </button>
                  )}
                </div>
              )}
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--rose)", flexShrink: 0 }}
                onClick={() => deleteMutation.mutate(ev.id)}>
                <Icon name="trash" size={11} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Formulaire upload */}
      {adding && (
        <div style={{ background: "var(--lime-pale)", border: "1px solid var(--lime)", borderRadius: 10, padding: 14, marginTop: 8 }}>
          <div className="grid grid-2" style={{ gap: 10, marginBottom: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Title *</label>
              <input className="field-input" placeholder="Evidence title…"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label" htmlFor="ev-type">Type</label>
              <Select
                id="ev-type"
                options={[["pdf","PDF Document"],["photo","Photo / Image"],["survey","Survey"],["report","Report"],["video","Video"],["other","Other"]].map(([value, label]) => ({ value, label }))}
                value={form.evidence_type}
                onChange={v => setForm(f => ({ ...f, evidence_type: v }))}
                required
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label className="field-label">Description</label>
            <input className="field-input" placeholder="Brief description…"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          {/* Upload fichier */}
          <div className="field" style={{ marginBottom: 10 }}>
            <label className="field-label">File (PDF max 25MB · Image max 10MB)</label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
              style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={() => fileRef.current.click()}>
              <Icon name="upload" size={13} /> {file ? file.name : "Choose file…"}
            </button>
          </div>
          {/* OU URL externe */}
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">OR External URL (KoBoToolbox, Drive…)</label>
            <input className="field-input" placeholder="https://…"
              value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setFile(null); }}>Cancel</button>
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }}
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !form.title.trim() || (!file && !form.external_url.trim())}>
              <Icon name="check" size={12} />
              {uploadMutation.isPending ? "Uploading…" : "Save evidence"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
