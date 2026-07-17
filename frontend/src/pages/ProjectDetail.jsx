import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import FinancialEnvelope from "../components/FinancialEnvelope";

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

export default function ProjectDetail({ projectId, onBack, canEdit = false }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [tForm, setTForm] = useState({
    to_stage: "",
    justification: "",
    document_reference: "",
    dual_authorized_by: "",
  });
  const [showClassificationForm, setShowClassificationForm] = useState(false);
  const [cForm, setCForm] = useState({
    gender_marker: "",
    implementation_modality: "",
    geographic_typology: "",
    fragility_status: "",
    risk_rating: "",
    cross_cutting_theme_ids: [],
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
  const { data: classificationChoices } = useQuery({
    queryKey: ["classification-choices"],
    queryFn: () => apiFetch("/api/projects/classification-choices/"),
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

  const classificationMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowClassificationForm(false);
    },
  });

  function openClassificationForm() {
    setCForm({
      gender_marker: project.gender_marker || "",
      implementation_modality: project.implementation_modality || "",
      geographic_typology: project.geographic_typology || "",
      fragility_status: project.fragility_status || "",
      risk_rating: project.risk_rating || "",
      cross_cutting_theme_ids: project.cross_cutting_theme_ids || [],
    });
    setShowClassificationForm(true);
  }

  function handleClassificationSubmit(e) {
    e.preventDefault();
    classificationMutation.mutate({
      gender_marker: cForm.gender_marker || null,
      implementation_modality: cForm.implementation_modality || null,
      geographic_typology: cForm.geographic_typology || null,
      fragility_status: cForm.fragility_status || null,
      risk_rating: cForm.risk_rating || null,
      cross_cutting_theme_ids: cForm.cross_cutting_theme_ids,
    });
  }

  function handleThemesChange(e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    setCForm({ ...cForm, cross_cutting_theme_ids: selected });
  }

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
            {!showClassificationForm && (
              <button className="btn btn-primary btn-sm" onClick={openClassificationForm}>
                Modifier
              </button>
            )}
          </div>
          <div className="card-body">
            {showClassificationForm ? (
              <form onSubmit={handleClassificationSubmit}>
                <div className="grid grid-2">
                  <div className="field">
                    <label className="field-label" htmlFor="genderMarker">Marqueur genre</label>
                    <select
                      id="genderMarker"
                      className="field-select"
                      value={cForm.gender_marker}
                      onChange={(e) => setCForm({ ...cForm, gender_marker: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {classificationChoices?.gender_marker.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="modality">Modalite de mise en oeuvre</label>
                    <select
                      id="modality"
                      className="field-select"
                      value={cForm.implementation_modality}
                      onChange={(e) => setCForm({ ...cForm, implementation_modality: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {classificationChoices?.implementation_modality.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="typology">Typologie geographique</label>
                    <select
                      id="typology"
                      className="field-select"
                      value={cForm.geographic_typology}
                      onChange={(e) => setCForm({ ...cForm, geographic_typology: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {classificationChoices?.geographic_typology.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="fragility">Statut de fragilite</label>
                    <select
                      id="fragility"
                      className="field-select"
                      value={cForm.fragility_status}
                      onChange={(e) => setCForm({ ...cForm, fragility_status: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {classificationChoices?.fragility_status.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="risk">Notation de risque</label>
                    <select
                      id="risk"
                      className="field-select"
                      value={cForm.risk_rating}
                      onChange={(e) => setCForm({ ...cForm, risk_rating: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {classificationChoices?.risk_rating.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="themes">Themes transversaux</label>
                    <select
                      id="themes"
                      className="field-select field-multi"
                      multiple
                      value={cForm.cross_cutting_theme_ids.map(String)}
                      onChange={handleThemesChange}
                    >
                      {classificationChoices?.cross_cutting_themes.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {classificationMutation.isError && (
                  <div className="field-error mb-3">
                    {JSON.stringify(classificationMutation.error.detail)}
                  </div>
                )}

                <div className="row">
                  <button className="btn btn-primary" type="submit" disabled={classificationMutation.isPending}>
                    {classificationMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setShowClassificationForm(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="dl">
                <Dt term="Secteur primaire">{project.primary_sector_name}</Dt>
                <Dt term="Secteurs contributifs">
                  {project.contributing_sector_names?.join(", ") || "—"}
                </Dt>
                <Dt term="ODD primaire">
                  {project.primary_sdg ? `ODD ${project.primary_sdg} — ${project.primary_sdg_name}` : "—"}
                </Dt>
                <Dt term="ODD contributifs">{project.contributing_sdg_names?.join(", ") || "—"}</Dt>
                <Dt term="Marqueur genre">{project.gender_marker_display || "—"}</Dt>
                <Dt term="Modalite">{project.implementation_modality_display || "—"}</Dt>
                <Dt term="Typologie geographique">{project.geographic_typology_display || "—"}</Dt>
                <Dt term="Themes transversaux">{project.cross_cutting_theme_names?.join(", ") || "—"}</Dt>
                <Dt term="Fragilite">{project.fragility_status_display || "—"}</Dt>
                <Dt term="Notation de risque">{project.risk_rating_display || "—"}</Dt>
              </div>
            )}
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

      {/* SF-6 — Enveloppe financiere */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">Enveloppe financiere</h2>
            <div className="card-sub">SF-6 · Financement mixte LLF2 · Indicatif — detail au Module 9</div>
          </div>
        </div>
        <FinancialEnvelope projectId={project.id} canEdit={canEdit} />
      </div>
    </div>
  );
}
