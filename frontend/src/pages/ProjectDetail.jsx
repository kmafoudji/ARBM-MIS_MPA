import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

const STAGE_BADGE = {
  concept_note: "badge",
  pipeline_taskforce_review: "badge",
  pipeline_taskforce_approved: "badge badge-violet",
  preparation_identification: "badge badge-violet",
  trc_endorsed: "badge badge-orange",
  ic_approved: "badge badge-orange",
  bed_approved: "badge badge-orange",
  appraisal: "badge badge-blue",
  effective: "badge badge-lime",
  implementing: "badge badge-lime",
  mid_term_review: "badge badge-lime",
  substantially_complete: "badge badge-green",
  closed: "badge badge-green",
  suspended: "badge badge-rose",
  cancelled: "badge badge-rose",
};

function Dt({ term, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <div className="dl-term">{term}</div>
      <div className="dl-desc">{children}</div>
    </div>
  );
}

export default function ProjectDetail({ projectId, onBack }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [tForm, setTForm] = useState({
    to_stage: "",
    justification: "",
    document_reference: "",
    dual_authorized_by: "",
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/`),
  });
  const { data: transitions } = useQuery({
    queryKey: ["project-transitions", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/transitions/`),
  });
  const { data: stageChoices } = useQuery({
    queryKey: ["stage-choices"],
    queryFn: () => apiFetch("/api/projects/stage-choices/"),
  });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => apiFetch("/api/identity/users/") });

  const mutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/transitions/`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-transitions", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowForm(false);
      setTForm({ to_stage: "", justification: "", document_reference: "", dual_authorized_by: "" });
    },
  });

  if (isLoading) {
    return (
      <div className="loading-wrap">
        <span className="spinner" /> Chargement de la fiche projet...
      </div>
    );
  }
  if (!project) return <div className="view">Projet introuvable.</div>;

  const otherStages = (stageChoices || []).filter((s) => s.value !== project.lifecycle_stage);
  const otherCountries = project.country_names?.filter((c) => c !== project.lead_country_name) || [];

  return (
    <div className="view">
      <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>
        ← Portefeuille
      </button>

      <div className="view-header">
        <div className="view-eyebrow text-mono">{project.code}</div>
        <h1 className="view-title">{project.name}</h1>
        <div className="row mt-2">
          <span className={STAGE_BADGE[project.lifecycle_stage] || "badge"}>
            {project.lifecycle_stage_display}
          </span>
          <span className="text-muted text-sm">
            {project.lead_country_name}
            {otherCountries.length > 0 && ` + ${otherCountries.join(", ")}`}
          </span>
        </div>
      </div>

      <div className="grid grid-2 mb-3">
        <div className="card card-flush">
          <div className="card-header">
            <h2 className="card-title">Identite &amp; perimetre</h2>
          </div>
          <div className="card-body">
            <div className="dl">
              <Dt term="Code interne">
                <span className="text-mono">{project.code}</span>
              </Dt>
              <Dt term="Reference officielle">{project.official_reference_number}</Dt>
              <Dt term="Pays chef de file">{project.lead_country_name}</Dt>
              <Dt term="Autres pays">{otherCountries.join(", ") || "—"}</Dt>
              <Dt term="Budget indicatif">
                {project.budget_amount
                  ? `${Number(project.budget_amount).toLocaleString("fr-FR")} USD`
                  : "—"}
              </Dt>
              <Dt term="Enregistre par">{project.created_by_email}</Dt>
            </div>
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title">Classification</h2>
              <div className="card-sub">SF-2 · requise au gate BED Approved</div>
            </div>
          </div>
          <div className="card-body">
            <div className="dl">
              <Dt term="Secteur primaire">{project.primary_sector_name}</Dt>
              <Dt term="Secteurs contributifs">
                {project.contributing_sector_names?.join(", ") || "—"}
              </Dt>
              <Dt term="ODD primaire">
                {project.primary_sdg ? `ODD ${project.primary_sdg} — ${project.primary_sdg_name}` : "—"}
              </Dt>
              <Dt term="ODD contributifs">{project.contributing_sdg_names?.join(", ") || "—"}</Dt>
              <Dt term="Marqueur genre">{project.gender_marker || "—"}</Dt>
              <Dt term="Modalite">{project.implementation_modality || "—"}</Dt>
              <Dt term="Typologie geographique">{project.geographic_typology || "—"}</Dt>
              <Dt term="Fragilite">{project.fragility_status || "—"}</Dt>
              <Dt term="Notation de risque">{project.risk_rating || "—"}</Dt>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-header">
          <div>
            <h2 className="card-title">Cycle de vie</h2>
            <div className="card-sub">
              Piste d'audit immuable · progression avant uniquement, autorisation double aux gates
            </div>
          </div>
          {!showForm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              Changer d'etape
            </button>
          )}
        </div>

        <div className="card-body">
          {showForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({ ...tForm, dual_authorized_by: tForm.dual_authorized_by || null });
              }}
              style={{
                background: "var(--paper)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-3)",
                padding: "var(--s-3)",
                marginBottom: "var(--s-4)",
              }}
            >
              <div className="grid grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="toStage">
                    Nouvelle etape <span className="req">*</span>
                  </label>
                  <select
                    id="toStage"
                    className="field-select"
                    value={tForm.to_stage}
                    onChange={(e) => setTForm({ ...tForm, to_stage: e.target.value })}
                    required
                  >
                    <option value="">Selectionner</option>
                    {otherStages.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="dual">
                    Second approbateur
                  </label>
                  <select
                    id="dual"
                    className="field-select"
                    value={tForm.dual_authorized_by}
                    onChange={(e) => setTForm({ ...tForm, dual_authorized_by: e.target.value })}
                  >
                    <option value="">Aucun</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                  <span className="field-help">
                    Requis aux gates TRC / IC / BED et pour tout retour arriere.
                  </span>
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="justif">
                  Justification
                </label>
                <textarea
                  id="justif"
                  className="field-textarea"
                  value={tForm.justification}
                  onChange={(e) => setTForm({ ...tForm, justification: e.target.value })}
                  placeholder="Obligatoire pour un retour arriere."
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="docref">
                  Reference documentaire
                </label>
                <input
                  id="docref"
                  className="field-input"
                  value={tForm.document_reference}
                  onChange={(e) => setTForm({ ...tForm, document_reference: e.target.value })}
                  placeholder="Ex. PV Comite d'investissement 2026-03"
                />
              </div>

              {mutation.isError && (
                <div className="field-error mb-3">
                  {[].concat(mutation.error.detail?.detail || mutation.error.detail).join(" ")}
                </div>
              )}

              <div className="row">
                <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Enregistrement..." : "Confirmer le changement"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                  Annuler
                </button>
              </div>
            </form>
          )}

          {transitions?.length === 0 && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Aucune transition enregistree — le projet est a son etape initiale.
            </p>
          )}

          {transitions?.length > 0 && (
            <div className="timeline">
              {transitions.map((t) => (
                <div className="timeline-item" key={t.id}>
                  <div className="timeline-head">
                    {t.from_stage_display} → <strong>{t.to_stage_display}</strong>
                  </div>
                  <div className="timeline-meta">
                    {new Date(t.transitioned_at).toLocaleString("fr-FR")} · {t.transitioned_by_email}
                    {t.dual_authorized_by_email && (
                      <> · co-approuve par {t.dual_authorized_by_email}</>
                    )}
                  </div>
                  {t.justification && <div className="timeline-note">{t.justification}</div>}
                  {t.document_reference && (
                    <div className="timeline-meta text-mono">{t.document_reference}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
