import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

const LEVELS = [
  { key: "activity", label: "Activites", parentKey: null },
  { key: "output", label: "Produits", parentKey: "activity" },
  { key: "immediate_outcome", label: "Effets immediats", parentKey: "output" },
  { key: "intermediate_outcome", label: "Effets intermediaires", parentKey: "immediate_outcome" },
];

const EMPTY_NODE_FORM = {
  parent: "",
  statement: "",
  key_result_indicator: "",
  means_of_verification: "",
  assumptions: "",
  risks_mitigation: "",
  adaptation_strategy: "",
  gender_climate_tag: "",
};

function NodeCard({ node, onSaved, onDeleted }) {
  const queryClient = useQueryClient();
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
    const { parent, chain_level, code, id, toc, created_at, updated_at, chain_level_display, ...payload } = form;
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
          <span>{node.statement}</span>
        </div>
        <span className="text-muted text-sm">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && !editing && (
        <div className="dl mt-2">
          <div>
            <div className="dl-term">Indicateur cle de resultat</div>
            <div className="dl-desc">{node.key_result_indicator || "—"}</div>
          </div>
          <div>
            <div className="dl-term">Moyens de verification</div>
            <div className="dl-desc">{node.means_of_verification || "—"}</div>
          </div>
          <div>
            <div className="dl-term">Hypotheses</div>
            <div className="dl-desc">{node.assumptions || "—"}</div>
          </div>
          <div>
            <div className="dl-term">Mitigation des risques</div>
            <div className="dl-desc">{node.risks_mitigation || "—"}</div>
          </div>
          <div>
            <div className="dl-term">Strategie d'adaptation</div>
            <div className="dl-desc">{node.adaptation_strategy || "—"}</div>
          </div>
          <div>
            <div className="dl-term">Tag genre / climat</div>
            <div className="dl-desc">{node.gender_climate_tag || "—"}</div>
          </div>
          <div className="row mt-2">
            <button className="btn btn-ghost btn-sm" type="button" onClick={startEdit}>
              Modifier
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={submitEdit} className="mt-2">
          <div className="field">
            <label className="field-label">Enonce</label>
            <textarea
              className="field-textarea"
              value={form.statement}
              onChange={(e) => setForm({ ...form, statement: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label className="field-label">Indicateur cle de resultat</label>
              <input
                className="field-input"
                value={form.key_result_indicator}
                onChange={(e) => setForm({ ...form, key_result_indicator: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label">Tag genre / climat</label>
              <input
                className="field-input"
                value={form.gender_climate_tag}
                onChange={(e) => setForm({ ...form, gender_climate_tag: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Moyens de verification</label>
            <textarea
              className="field-textarea"
              value={form.means_of_verification}
              onChange={(e) => setForm({ ...form, means_of_verification: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label">Hypotheses</label>
            <textarea
              className="field-textarea"
              value={form.assumptions}
              onChange={(e) => setForm({ ...form, assumptions: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label">Mitigation des risques</label>
            <textarea
              className="field-textarea"
              value={form.risks_mitigation}
              onChange={(e) => setForm({ ...form, risks_mitigation: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label">Strategie d'adaptation</label>
            <textarea
              className="field-textarea"
              value={form.adaptation_strategy}
              onChange={(e) => setForm({ ...form, adaptation_strategy: e.target.value })}
            />
          </div>
          {updateMutation.isError && (
            <div className="field-error mb-3">{JSON.stringify(updateMutation.error.detail)}</div>
          )}
          <div className="row">
            <button className="btn btn-primary btn-sm" type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function LevelSection({ level, nodes, parentOptions, projectId, onChanged }) {
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
      key_result_indicator: form.key_result_indicator,
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
        <div>
          <h2 className="card-title">{level.label}</h2>
          <div className="card-sub">{nodes.length} noeud{nodes.length !== 1 ? "s" : ""}</div>
        </div>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + Ajouter
          </button>
        )}
      </div>
      <div className="card-body">
        {nodes.length === 0 && !adding && (
          <p className="text-muted text-sm" style={{ margin: 0 }}>Aucun noeud a ce niveau.</p>
        )}
        <div className="row" style={{ flexDirection: "column", gap: 10, alignItems: "stretch" }}>
          {nodes.map((n) => (
            <NodeCard key={n.id} node={n} onSaved={onChanged} onDeleted={onChanged} />
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
                  <option value="">Selectionner</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.statement.slice(0, 60)}
                    </option>
                  ))}
                </select>
                {parentOptions.length === 0 && (
                  <span className="field-help">
                    Aucun noeud au niveau superieur pour l'instant — creez-en un d'abord.
                  </span>
                )}
              </div>
            )}
            <div className="field">
              <label className="field-label">
                Enonce <span className="req">*</span>
              </label>
              <textarea
                className="field-textarea"
                value={form.statement}
                onChange={(e) => setForm({ ...form, statement: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label className="field-label">Hypotheses</label>
              <textarea
                className="field-textarea"
                value={form.assumptions}
                onChange={(e) => setForm({ ...form, assumptions: e.target.value })}
                placeholder="Conditions supposees pour que le pathway causal tienne."
              />
            </div>
            {createMutation.isError && (
              <div className="field-error mb-3">{JSON.stringify(createMutation.error.detail)}</div>
            )}
            <div className="row">
              <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Enregistrement..." : "Ajouter"}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  setAdding(false);
                  setForm(EMPTY_NODE_FORM);
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function TheoryOfChange({ projectId, onBack }) {
  const queryClient = useQueryClient();
  const [editingFrame, setEditingFrame] = useState(false);
  const [frameForm, setFrameForm] = useState({ problem_statement: "", ultimate_outcome: "", status: "draft" });

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
  if (!toc) return <div className="view">Introuvable.</div>;

  // Nodes portent deja `toc` (l'id de la ToC) cote donnees ? Non — on
  // l'injecte ici pour que NodeCard puisse construire l'URL de son PATCH/
  // DELETE sans avoir a le faire remonter depuis le parent a chaque fois.
  const nodesWithToc = toc.nodes.map((n) => ({ ...n, toc: projectId }));

  return (
    <div className="view">
      <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>
        ← Fiche projet
      </button>

      <div className="view-header">
        <div className="view-eyebrow text-mono">{toc.project_code}</div>
        <h1 className="view-title">Theorie du Changement</h1>
        <div className="row mt-2">
          <span className="badge">{toc.status_display}</span>
          <span className="text-muted text-sm">{toc.project_name}</span>
        </div>
      </div>

      <div className="card card-flush mb-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">Cadre</h2>
            <div className="card-sub">Enonce du probleme et effet ultime (sommet de la chaine)</div>
          </div>
          {!editingFrame && (
            <button className="btn btn-primary btn-sm" onClick={openFrameEdit}>
              Modifier
            </button>
          )}
        </div>
        <div className="card-body">
          {editingFrame ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                frameMutation.mutate(frameForm);
              }}
            >
              <div className="field">
                <label className="field-label">Statut</label>
                <select
                  className="field-select"
                  value={frameForm.status}
                  onChange={(e) => setFrameForm({ ...frameForm, status: e.target.value })}
                >
                  <option value="draft">Brouillon</option>
                  <option value="active">Active</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Enonce du probleme</label>
                <textarea
                  className="field-textarea"
                  value={frameForm.problem_statement}
                  onChange={(e) => setFrameForm({ ...frameForm, problem_statement: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label">Effet ultime (impact)</label>
                <textarea
                  className="field-textarea"
                  value={frameForm.ultimate_outcome}
                  onChange={(e) => setFrameForm({ ...frameForm, ultimate_outcome: e.target.value })}
                />
              </div>
              {frameMutation.isError && (
                <div className="field-error mb-3">{JSON.stringify(frameMutation.error.detail)}</div>
              )}
              <div className="row">
                <button className="btn btn-primary btn-sm" type="submit" disabled={frameMutation.isPending}>
                  {frameMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingFrame(false)}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div className="dl">
              <div>
                <div className="dl-term">Enonce du probleme</div>
                <div className="dl-desc">{toc.problem_statement || "—"}</div>
              </div>
              <div>
                <div className="dl-term">Effet ultime (impact)</div>
                <div className="dl-desc">{toc.ultimate_outcome || "—"}</div>
              </div>
            </div>
          )}
        </div>
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
        />
      ))}
    </div>
  );
}
