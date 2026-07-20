import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import RichText, { stripHtml } from "../components/RichText";
import RichTextEditor from "../components/RichTextEditor";
import TagInput from "../components/TagInput";

const LEVELS = [
  { key: "activity", label: "Activities", parentKey: null, icon: "zap" },
  { key: "output", label: "Outputs", parentKey: "activity", icon: "package" },
  { key: "immediate_outcome", label: "Immediate Outcomes", parentKey: "output", icon: "trending-up" },
  { key: "intermediate_outcome", label: "Intermediate Outcomes", parentKey: "immediate_outcome", icon: "layers" },
];

const EMPTY_NODE_FORM = {
  parent: "",
  statement: "",
  logframe_row: "",
  means_of_verification: "",
  assumptions: "",
  risks_mitigation: "",
  adaptation_strategy: "",
  gender_climate_tag: "",
};

/**
 * Select des lignes logframe d'un projet — recharge uniquement quand le
 * formulaire est ouvert (enabled: true par defaut ici car ce composant
 * n'est monté que dans ce cas).
 */
function LogframeRowSelect({ projectId, value, onChange }) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["logframe", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/logframe/`),
  });

  if (isLoading) return <div className="field-input text-muted text-sm">Loading...</div>;

  if (!rows || rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 0" }}>
        No logframe lines — add indicators via "Logical Framework" first.
      </div>
    );
  }

  return (
    <select className="field-select" value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">No indicator linked</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {r.indicator_code} — {r.indicator_name.slice(0, 55)}
        </option>
      ))}
    </select>
  );
}

function NodeCard({ node, projectId, onSaved, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(node);

  const updateMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${node.toc}/toc/nodes/${node.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/projects/${node.toc}/toc/nodes/${node.id}/`, { method: "DELETE" }),
    onSuccess: onDeleted,
  });

  function startEdit() {
    setForm(node);
    setEditing(true);
    setExpanded(true);
  }

  function submitEdit(e) {
    e.preventDefault();
    const { parent, chain_level, code, id, toc, created_at, updated_at, chain_level_display,
            logframe_row_id, logframe_indicator_code, logframe_indicator_name,
            logframe_indicator_unit, logframe_baseline_value, logframe_baseline_year,
            ...payload } = form;
    payload.logframe_row = form.logframe_row_id || null;
    updateMutation.mutate(payload);
  }

  return (
    <div
      style={{
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-3)",
        padding: "var(--s-3)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => !editing && setExpanded(!expanded)}>
        <div className="row" style={{ gap: 10 }}>
          <span className="text-mono badge">{node.code}</span>
          <span>{stripHtml(node.statement)}</span>
        </div>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} style={{ color: "var(--muted)" }} />
      </div>

      {expanded && !editing && (
        <div className="dl mt-2">
          <div>
            <div className="dl-term">Indicator (logframe)</div>
            <div className="dl-desc">
              {node.logframe_indicator_code ? (
                <span className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="text-mono badge" style={{ fontSize: 11 }}>{node.logframe_indicator_code}</span>
                  <span>{node.logframe_indicator_name}</span>
                  {node.logframe_baseline_value != null && (
                    <span className="text-muted text-sm">
                      baseline : {Number(node.logframe_baseline_value).toLocaleString("fr-FR")} {node.logframe_indicator_unit}
                      {node.logframe_baseline_year ? ` (${node.logframe_baseline_year})` : ""}
                    </span>
                  )}
                </span>
              ) : "—"}
            </div>
          </div>
          <div>
            <div className="dl-term">Means of Verification</div>
            <div className="dl-desc"><RichText value={node.means_of_verification} /></div>
          </div>
          <div>
            <div className="dl-term">Assumptions</div>
            <div className="dl-desc"><RichText value={node.assumptions} /></div>
          </div>
          <div>
            <div className="dl-term">Risk Mitigation</div>
            <div className="dl-desc"><RichText value={node.risks_mitigation} /></div>
          </div>
          <div>
            <div className="dl-term">Adaptation Strategy</div>
            <div className="dl-desc"><RichText value={node.adaptation_strategy} /></div>
          </div>
          <div>
            <div className="dl-term">Gender / Climate Tag</div>
            <div className="dl-desc">
              {node.gender_climate_tag ? (
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {node.gender_climate_tag.split(",").map((t) => t.trim()).filter(Boolean).map((t, i) => (
                    <span key={i} className="badge">{t}</span>
                  ))}
                </div>
              ) : "—"}
            </div>
          </div>
          <div className="row mt-2">
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={startEdit}>
              <Icon name="pencil" size={14} /> Edit
            </button>
            <button
              className="btn btn-ghost btn-sm row"
              style={{ gap: 6 }}
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete node ${node.code} ("${stripHtml(node.statement).slice(0, 60)}")? ` +
                      "All child nodes (direct and indirect) will be deleted with it. " +
                      "This action is irreversible."
                  )
                ) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Icon name="trash" size={14} /> {deleteMutation.isPending ? "Suppression..." : "Delete"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={submitEdit} className="mt-2">
          <div className="field">
            <label className="field-label">Statement</label>
            <RichTextEditor
              value={form.statement}
              onChange={(html) => setForm({ ...form, statement: html })}
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label className="field-label">Indicator (logframe)</label>
              <LogframeRowSelect
                projectId={projectId}
                value={form.logframe_row_id || ""}
                onChange={(v) => setForm({ ...form, logframe_row_id: v })}
              />
            </div>
            <div className="field">
              <label className="field-label">Gender / Climate Tag</label>
              <TagInput
                value={form.gender_climate_tag}
                onChange={(v) => setForm({ ...form, gender_climate_tag: v })}
                placeholder="gender, climate, youth..."
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Means of Verification</label>
            <RichTextEditor
              value={form.means_of_verification}
              onChange={(html) => setForm({ ...form, means_of_verification: html })}
            />
          </div>
          <div className="field">
            <label className="field-label">Assumptions</label>
            <RichTextEditor
              value={form.assumptions}
              onChange={(html) => setForm({ ...form, assumptions: html })}
            />
          </div>
          <div className="field">
            <label className="field-label">Risk Mitigation</label>
            <RichTextEditor
              value={form.risks_mitigation}
              onChange={(html) => setForm({ ...form, risks_mitigation: html })}
            />
          </div>
          <div className="field">
            <label className="field-label">Adaptation Strategy</label>
            <RichTextEditor
              value={form.adaptation_strategy}
              onChange={(html) => setForm({ ...form, adaptation_strategy: html })}
            />
          </div>
          {updateMutation.isError && (
            <div className="field-error mb-3">{JSON.stringify(updateMutation.error.detail)}</div>
          )}
          <div className="row">
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={updateMutation.isPending}>
              <Icon name="check" size={14} /> {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={() => setEditing(false)}>
              <Icon name="x" size={14} /> Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function LevelSection({ level, nodes, parentOptions, projectId, onChanged, collapsed, onToggleCollapse }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_NODE_FORM);

  const createMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/toc/nodes/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setAdding(false);
      setForm(EMPTY_NODE_FORM);
      onChanged();
    },
  });

  function submit(e) {
    e.preventDefault();
    createMutation.mutate({
      chain_level: level.key,
      parent: form.parent || null,
      statement: form.statement,
      logframe_row: form.logframe_row || null,
      means_of_verification: form.means_of_verification,
      assumptions: form.assumptions,
      risks_mitigation: form.risks_mitigation,
      adaptation_strategy: form.adaptation_strategy,
      gender_climate_tag: form.gender_climate_tag,
    });
  }

  return (
    <div className="card card-flush mb-3">
      <div className="card-header">
        <div className="row" style={{ gap: 10, alignItems: "center", cursor: "pointer" }} onClick={onToggleCollapse}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "color-mix(in srgb, var(--lime-dark) 14%, transparent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--lime-dark)",
            }}
          >
            <Icon name={level.icon} size={18} />
          </span>
          <div>
            <h2 className="card-title">{level.label}</h2>
            <div className="card-sub">{nodes.length} node{nodes.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!adding && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> Add
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            aria-label={collapsed ? "Deplier" : "Replier"}
            onClick={onToggleCollapse}
          >
            <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={16} />
          </button>
        </div>
      </div>
      {!collapsed && (
      <div className="card-body">
        {nodes.length === 0 && !adding && (
          <p className="text-muted text-sm" style={{ margin: 0 }}>No nodes at this level.</p>
        )}
        <div className="row" style={{ flexDirection: "column", gap: 10, alignItems: "stretch" }}>
          {nodes.map((n) => (
            <NodeCard key={n.id} node={n} projectId={projectId} onSaved={onChanged} onDeleted={onChanged} />
          ))}
        </div>

        {adding && (
          <form
            onSubmit={submit}
            className="mt-3"
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-3)",
              padding: "var(--s-3)",
            }}
          >
            {level.parentKey && (
              <div className="field">
                <label className="field-label">
                  Rattache a <span className="req">*</span>
                </label>
                <select
                  className="field-select"
                  value={form.parent}
                  onChange={(e) => setForm({ ...form, parent: e.target.value })}
                  required
                >
                  <option value="">Select</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {stripHtml(p.statement).slice(0, 60)}
                    </option>
                  ))}
                </select>
                {parentOptions.length === 0 && (
                  <span className="field-help">
                    No node at a higher level yet — create one first.
                  </span>
                )}
              </div>
            )}
            <div className="field">
              <label className="field-label">
                Enonce <span className="req">*</span>
              </label>
              <RichTextEditor
                value={form.statement}
                onChange={(html) => setForm({ ...form, statement: html })}
              />
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label className="field-label">Indicator (logframe)</label>
                <LogframeRowSelect
                  projectId={projectId}
                  value={form.logframe_row}
                  onChange={(v) => setForm({ ...form, logframe_row: v })}
                />
              </div>
              <div className="field">
                <label className="field-label">Gender / Climate Tag</label>
                <TagInput
                  value={form.gender_climate_tag}
                  onChange={(v) => setForm({ ...form, gender_climate_tag: v })}
                  placeholder="gender, climate, youth..."
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Means of Verification</label>
              <RichTextEditor
                value={form.means_of_verification}
                onChange={(html) => setForm({ ...form, means_of_verification: html })}
              />
            </div>
            <div className="field">
              <label className="field-label">Assumptions</label>
              <RichTextEditor
                value={form.assumptions}
                onChange={(html) => setForm({ ...form, assumptions: html })}
                placeholder="Conditions assumed true for the causal pathway to hold."
              />
            </div>
            <div className="field">
              <label className="field-label">Risk Mitigation</label>
              <RichTextEditor
                value={form.risks_mitigation}
                onChange={(html) => setForm({ ...form, risks_mitigation: html })}
              />
            </div>
            <div className="field">
              <label className="field-label">Adaptation Strategy</label>
              <RichTextEditor
                value={form.adaptation_strategy}
                onChange={(html) => setForm({ ...form, adaptation_strategy: html })}
              />
            </div>
            {createMutation.isError && (
              <div className="field-error mb-3">{JSON.stringify(createMutation.error.detail)}</div>
            )}
            <div className="row">
              <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={createMutation.isPending}>
                <Icon name="plus" size={14} /> {createMutation.isPending ? "Saving..." : "Add"}
              </button>
              <button
                className="btn btn-ghost btn-sm row"
                style={{ gap: 6 }}
                type="button"
                onClick={() => {
                  setAdding(false);
                  setForm(EMPTY_NODE_FORM);
                }}
              >
                <Icon name="x" size={14} /> Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      )}
    </div>
  );
}

export default function TheoryOfChange({ projectId, onBack }) {
  const queryClient = useQueryClient();
  const [editingFrame, setEditingFrame] = useState(false);
  const [frameForm, setFrameForm] = useState({ problem_statement: "", ultimate_outcome: "", status: "draft" });
  const [collapsedSections, setCollapsedSections] = useState({});

  function toggleSection(key) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const { data: toc, isLoading } = useQuery({
    queryKey: ["toc", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/toc/`),
  });

  const frameMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/toc/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["toc", projectId] });
      setEditingFrame(false);
    },
  });

  function onChanged() {
    queryClient.invalidateQueries({ queryKey: ["toc", projectId] });
  }

  function openFrameEdit() {
    setFrameForm({
      problem_statement: toc.problem_statement || "",
      ultimate_outcome: toc.ultimate_outcome || "",
      status: toc.status,
    });
    setEditingFrame(true);
  }

  if (isLoading) {
    return (
      <div className="loading-wrap">
        <span className="spinner" /> Chargement de la Theorie du Changement...
      </div>
    );
  }
  if (!toc) return <div className="view">Not found.</div>;

  // Nodes portent deja `toc` (l'id de la ToC) cote donnees ? Non — on
  // l'injecte ici pour que NodeCard puisse construire l'URL de son PATCH/
  // DELETE sans avoir a le faire remonter depuis le parent a chaque fois.
  const nodesWithToc = toc.nodes.map((n) => ({ ...n, toc: projectId }));

  return (
    <div className="view">
      <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>
        ← Project
      </button>

      <div className="view-header">
        <div className="view-eyebrow text-mono">{toc.project_code}</div>
        <h1 className="view-title">Theory of Change</h1>
        <div className="row mt-2">
          <span className="badge">{toc.status_display}</span>
          <span className="text-muted text-sm">{toc.project_name}</span>
        </div>
      </div>

      <div className="card card-flush mb-3">
        <div className="card-header">
          <div className="row" style={{ gap: 10, alignItems: "center", cursor: "pointer" }} onClick={() => toggleSection("frame")}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "color-mix(in srgb, var(--lime-dark) 14%, transparent)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--lime-dark)",
              }}
            >
              <Icon name="target" size={18} />
            </span>
            <div>
              <h2 className="card-title">Frame</h2>
              <div className="card-sub">Problem statement and ultimate outcome (top of the chain)</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {!editingFrame && (
              <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openFrameEdit}>
                <Icon name="pencil" size={14} /> Edit
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              aria-label={collapsedSections.frame ? "Deplier" : "Replier"}
              onClick={() => toggleSection("frame")}
            >
              <Icon name={collapsedSections.frame ? "chevron-down" : "chevron-up"} size={16} />
            </button>
          </div>
        </div>
        {!collapsedSections.frame && (
        <div className="card-body">
          {editingFrame ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                frameMutation.mutate(frameForm);
              }}
            >
              <div className="field">
                <label className="field-label">Status</label>
                <select
                  className="field-select"
                  value={frameForm.status}
                  onChange={(e) => setFrameForm({ ...frameForm, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Problem Statement</label>
                <RichTextEditor
                  value={frameForm.problem_statement}
                  onChange={(html) => setFrameForm({ ...frameForm, problem_statement: html })}
                />
              </div>
              <div className="field">
                <label className="field-label">Ultimate Outcome (Impact)</label>
                <RichTextEditor
                  value={frameForm.ultimate_outcome}
                  onChange={(html) => setFrameForm({ ...frameForm, ultimate_outcome: html })}
                />
              </div>
              {frameMutation.isError && (
                <div className="field-error mb-3">{JSON.stringify(frameMutation.error.detail)}</div>
              )}
              <div className="row">
                <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={frameMutation.isPending}>
                  <Icon name="check" size={14} /> {frameMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={() => setEditingFrame(false)}>
                  <Icon name="x" size={14} /> Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="dl">
              <div>
                <div className="dl-term">Problem Statement</div>
                <div className="dl-desc"><RichText value={toc.problem_statement} /></div>
              </div>
              <div>
                <div className="dl-term">Ultimate Outcome (Impact)</div>
                <div className="dl-desc"><RichText value={toc.ultimate_outcome} /></div>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {LEVELS.map((level) => (
        <LevelSection
          key={level.key}
          level={level}
          nodes={nodesWithToc.filter((n) => n.chain_level === level.key)}
          parentOptions={
            level.parentKey ? nodesWithToc.filter((n) => n.chain_level === level.parentKey) : []
          }
          projectId={projectId}
          onChanged={onChanged}
          collapsed={!!collapsedSections[level.key]}
          onToggleCollapse={() => toggleSection(level.key)}
        />
      ))}
    </div>
  );
}
