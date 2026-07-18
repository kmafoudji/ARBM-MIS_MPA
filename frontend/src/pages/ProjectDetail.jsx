import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "../api";
import SectorIcon from "../components/SectorIcon";
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

export default function ProjectDetail({ projectId, onBack, onOpenToC, canEdit = false }) {
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
    primary_sector: "",
    contributing_sector_ids: [],
    primary_sdg: "",
    contributing_sdg_ids: [],
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
  const { data: sectors } = useQuery({ queryKey: ["sectors"], queryFn: () => apiFetch("/api/reference/sectors/") });
  const { data: sdgs } = useQuery({ queryKey: ["sdgs"], queryFn: () => apiFetch("/api/reference/sdgs/") });
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
      primary_sector: project.primary_sector || "",
      contributing_sector_ids: project.contributing_sectors_detail?.map((s) => s.id) || [],
      primary_sdg: project.primary_sdg || "",
      contributing_sdg_ids: project.contributing_sdgs_detail?.map((s) => s.number) || [],
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
      primary_sector: cForm.primary_sector ? Number(cForm.primary_sector) : null,
      contributing_sector_ids: cForm.contributing_sector_ids,
      primary_sdg: cForm.primary_sdg ? Number(cForm.primary_sdg) : null,
      contributing_sdg_ids: cForm.contributing_sdg_ids,
      gender_marker: cForm.gender_marker || null,
      implementation_modality: cForm.implementation_modality || null,
      geographic_typology: cForm.geographic_typology || null,
      fragility_status: cForm.fragility_status || null,
      risk_rating: cForm.risk_rating || null,
      cross_cutting_theme_ids: cForm.cross_cutting_theme_ids,
    });
  }

  function handleMultiSelect(field, e) {
    const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
    setCForm({ ...cForm, [field]: selected });
  }

  const contributingSectorChoices = (sectors || []).filter(
    (s) => String(s.id) !== String(cForm.primary_sector)
  );
  const contributingSdgChoices = (sdgs || []).filter(
    (s) => String(s.number) !== String(cForm.primary_sdg)
  );

  const padUploadMutation = useMutation({
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload(`/api/projects/${projectId}/pad/`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const padDeleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/pad/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  function handlePadFileChange(e) {
    const file = e.target.files?.[0];
    if (file) padUploadMutation.mutate(file);
    e.target.value = "";
  }

  const [showReportingForm, setShowReportingForm] = useState(false);
  const [rForm, setRForm] = useState({ reporting_frequency: "", next_reporting_due: "" });

  const reportingMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/reporting-config/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowReportingForm(false);
    },
  });

  function openReportingForm() {
    setRForm({
      reporting_frequency: project.reporting_frequency || "",
      next_reporting_due: project.next_reporting_due || "",
    });
    setShowReportingForm(true);
  }

  function handleReportingSubmit(e) {
    e.preventDefault();
    reportingMutation.mutate({
      reporting_frequency: rForm.reporting_frequency || null,
      next_reporting_due: rForm.next_reporting_due || null,
    });
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
  const countries = project.countries_detail || [];
  const leadCountry = countries.find((c) => c.is_lead);
  const otherCountries = countries.filter((c) => !c.is_lead);

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
            {leadCountry && `${leadCountry.flag} ${leadCountry.name}`}
            {otherCountries.length > 0 &&
              ` + ${otherCountries.map((c) => `${c.flag} ${c.name}`).join(", ")}`}
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
              <Dt term="Pays chef de file">
                {leadCountry ? `${leadCountry.flag} ${leadCountry.name}` : "—"}
              </Dt>
              <Dt term="Autres pays">
                {otherCountries.length > 0
                  ? otherCountries.map((c) => `${c.flag} ${c.name}`).join(", ")
                  : "—"}
              </Dt>
              <Dt term="Hub regional">{project.hub_name || "—"}</Dt>
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
                    <label className="field-label" htmlFor="cPrimarySector">Secteur primaire</label>
                    <select
                      id="cPrimarySector"
                      className="field-select"
                      value={cForm.primary_sector}
                      onChange={(e) => setCForm({ ...cForm, primary_sector: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {sectors?.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="cContribSectors">Secteurs contributifs</label>
                    <select
                      id="cContribSectors"
                      className="field-select field-multi"
                      multiple
                      value={cForm.contributing_sector_ids.map(String)}
                      onChange={(e) => handleMultiSelect("contributing_sector_ids", e)}
                    >
                      {contributingSectorChoices.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="cPrimarySdg">ODD primaire</label>
                    <select
                      id="cPrimarySdg"
                      className="field-select"
                      value={cForm.primary_sdg}
                      onChange={(e) => setCForm({ ...cForm, primary_sdg: e.target.value })}
                    >
                      <option value="">Selectionner</option>
                      {sdgs?.map((s) => (
                        <option key={s.number} value={s.number}>ODD {s.number} — {s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="cContribSdgs">ODD contributifs</label>
                    <select
                      id="cContribSdgs"
                      className="field-select field-multi"
                      multiple
                      value={cForm.contributing_sdg_ids.map(String)}
                      onChange={(e) => handleMultiSelect("contributing_sdg_ids", e)}
                    >
                      {contributingSdgChoices.map((s) => (
                        <option key={s.number} value={s.number}>ODD {s.number} — {s.name}</option>
                      ))}
                    </select>
                  </div>

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
                      onChange={(e) => handleMultiSelect("cross_cutting_theme_ids", e)}
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
                <Dt term="Secteur primaire">
                  {project.primary_sector_name ? (
                    <span className="row" style={{ gap: 8, alignItems: "center" }}>
                      <SectorIcon name={project.primary_sector_icon} color={project.primary_sector_color} size={24} />
                      {project.primary_sector_name}
                    </span>
                  ) : "—"}
                </Dt>
                <Dt term="Secteurs contributifs">
                  {project.contributing_sectors_detail?.length ? (
                    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                      {project.contributing_sectors_detail.map((s) => (
                        <span key={s.id} className="row" style={{ gap: 6, alignItems: "center" }}>
                          <SectorIcon name={s.icon} color={s.color} size={20} />
                          {s.name}
                        </span>
                      ))}
                    </div>
                  ) : "—"}
                </Dt>
                <Dt term="ODD primaire">
                  {project.primary_sdg ? (
                    <span className="row" style={{ gap: 8, alignItems: "center" }}>
                      <img
                        className="sdg-icon"
                        src={`/logos/sdg/${project.primary_sdg}.png`}
                        alt={`ODD ${project.primary_sdg}`}
                        style={{ width: 24, height: 24 }}
                      />
                      {`ODD ${project.primary_sdg} — ${project.primary_sdg_name}`}
                    </span>
                  ) : "—"}
                </Dt>
                <Dt term="ODD contributifs">
                  {project.contributing_sdgs_detail?.length ? (
                    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                      {project.contributing_sdgs_detail.map((s) => (
                        <span key={s.number} className="row" style={{ gap: 6, alignItems: "center" }}>
                          <img
                            className="sdg-icon"
                            src={`/logos/sdg/${s.number}.png`}
                            alt={`ODD ${s.number}`}
                            style={{ width: 20, height: 20 }}
                          />
                          {`ODD ${s.number} — ${s.name}`}
                        </span>
                      ))}
                    </div>
                  ) : "—"}
                </Dt>
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

      {/* SF-1 Etape 1 — Reference PAD */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">Document PAD</h2>
            <div className="card-sub">
              SF-1 · Reference documentaire — l'extraction IA (BRQ-1.14) n'est pas encore active
            </div>
          </div>
        </div>
        <div className="card-body">
          {project.pad_reference_url ? (
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <a
                className="text-mono text-sm"
                href={project.pad_reference_url}
                target="_blank"
                rel="noreferrer"
              >
                {project.pad_reference_name}
              </a>
              <div className="row">
                <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
                  {padUploadMutation.isPending ? "Televersement..." : "Remplacer"}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePadFileChange}
                    style={{ display: "none" }}
                  />
                </label>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={padDeleteMutation.isPending}
                  onClick={() => padDeleteMutation.mutate()}
                >
                  {padDeleteMutation.isPending ? "Retrait..." : "Retirer"}
                </button>
              </div>
            </div>
          ) : (
            <label className="btn btn-primary btn-sm" style={{ cursor: "pointer" }}>
              {padUploadMutation.isPending ? "Televersement..." : "Televerser le PAD (PDF)"}
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePadFileChange}
                style={{ display: "none" }}
              />
            </label>
          )}
          {(padUploadMutation.isError || padDeleteMutation.isError) && (
            <div className="field-error mt-2">
              {JSON.stringify(
                (padUploadMutation.error || padDeleteMutation.error)?.detail
              )}
            </div>
          )}
        </div>
      </div>

      {/* SF-1 Etape 2 — Theorie du Changement */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">Theorie du Changement</h2>
            <div className="card-sub">
              SF-1 · Etape 2 · BRQ-1.35 — obligatoire des Pipeline Taskforce Approved
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onOpenToC}>
            Ouvrir
          </button>
        </div>
      </div>

      {/* SF-1 Etape 5 — Reporting */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">Reporting</h2>
            <div className="card-sub">
              SF-1 · Etape 5 · Chaine d'approbation — question ouverte, hors perimetre pour l'instant
            </div>
          </div>
          {!showReportingForm && (
            <button className="btn btn-primary btn-sm" onClick={openReportingForm}>
              Modifier
            </button>
          )}
        </div>
        <div className="card-body">
          {showReportingForm ? (
            <form onSubmit={handleReportingSubmit}>
              <div className="grid grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="reportingFreq">Frequence</label>
                  <select
                    id="reportingFreq"
                    className="field-select"
                    value={rForm.reporting_frequency}
                    onChange={(e) => setRForm({ ...rForm, reporting_frequency: e.target.value })}
                  >
                    <option value="">Selectionner</option>
                    <option value="quarterly">Trimestrielle</option>
                    <option value="semi_annual">Semestrielle</option>
                    <option value="annual">Annuelle</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="nextDue">Premiere echeance</label>
                  <input
                    id="nextDue"
                    className="field-input"
                    type="date"
                    value={rForm.next_reporting_due}
                    onChange={(e) => setRForm({ ...rForm, next_reporting_due: e.target.value })}
                  />
                </div>
              </div>
              {reportingMutation.isError && (
                <div className="field-error mb-3">
                  {JSON.stringify(reportingMutation.error.detail)}
                </div>
              )}
              <div className="row">
                <button className="btn btn-primary" type="submit" disabled={reportingMutation.isPending}>
                  {reportingMutation.isPending ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowReportingForm(false)}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div className="dl">
              <Dt term="Frequence">{project.reporting_frequency_display || "—"}</Dt>
              <Dt term="Premiere echeance">
                {project.next_reporting_due
                  ? new Date(project.next_reporting_due).toLocaleDateString("fr-FR")
                  : "—"}
              </Dt>
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
