import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "../api";
import SectorIcon from "../components/SectorIcon";
import FinancialEnvelope from "../components/FinancialEnvelope";
import ImplementingPartners from "../components/ImplementingPartners";
import GeographicScope from "../components/GeographicScope";
import ReportingSchedule from "../components/ReportingSchedule";
import Toast from "../components/Toast";
import Icon from "../components/Icon";

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

const STAGE_TOAST = {
  pipeline_taskforce_review: {
    type: "info",
    title: "Pipeline Taskforce Review",
    message: "The project has entered the review pipeline. Ensure the concept note and basic identity are complete before the committee meeting.",
  },
  pipeline_taskforce_approved: {
    type: "success",
    title: "Pipeline Taskforce Approved",
    message: "The project has been approved by the Taskforce. You can now proceed to the preparation and identification phase.",
  },
  preparation_identification: {
    type: "info",
    title: "Preparation / Identification",
    message: "Project is under preparation. Complete the Theory of Change, geographic scope, and financial envelope before the TRC.",
  },
  trc_endorsed: {
    type: "success",
    title: "TRC Endorsed",
    message: "The Technical Review Committee has endorsed the project.",
    bullets: ["Verify that all classification fields are complete.", "The IC Approval gate will require a second approver."],
  },
  ic_approved: {
    type: "success",
    title: "IC Approved",
    message: "Investment Committee approval recorded.",
    bullets: ["Ensure BED Approved prerequisites are met: Gender Marker, Risk Rating, Fragility Status, start and end dates."],
  },
  appraisal: {
    type: "info",
    title: "Appraisal",
    message: "Project is under appraisal. Review all technical and financial parameters before BED submission.",
  },
  bed_approved: {
    type: "success",
    title: "BED Approved",
    message: "Board / Executive Director approval recorded. The project is ready to become Effective.",
    bullets: ["Upload the final PAD if not already done.", "Confirm reporting dates are set before transitioning to Effective."],
  },
  effective: {
    type: "success",
    title: "⚡ Project is now Effective",
    message: "The workspace has been activated.",
    bullets: [
      "Theory of Change is now locked — no further structural edits.",
      "Reporting schedule has been auto-generated.",
      "GIS scope inherited by Module 5.",
      "Results framework (Module 2) is ready for data entry.",
    ],
  },
  implementing: {
    type: "info",
    title: "Implementing",
    message: "Project implementation phase has started. Reporting periods are open for data collection.",
  },
  mid_term_review: {
    type: "warning",
    title: "Mid-Term Review",
    message: "The project is under mid-term review. Results data and evidence should be up to date before the review meeting.",
  },
  substantially_complete: {
    type: "success",
    title: "Substantially Complete",
    message: "Project activities are substantially complete. Prepare the completion report and final evidence package.",
  },
  closed: {
    type: "info",
    title: "Project Closed",
    message: "The project has been officially closed. All data is now read-only.",
  },
  suspended: {
    type: "warning",
    title: "Project Suspended",
    message: "The project has been suspended. Document the reasons and define a reactivation plan.",
  },
  cancelled: {
    type: "error",
    title: "Project Cancelled",
    message: "The project has been cancelled. Ensure all financial obligations are settled and the closure note is filed.",
  },
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

export default function ProjectDetail({ projectId, onBack, onOpenToC, onOpenLogframe, canEdit = false }) {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
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
  const { data: envelope } = useQuery({ queryKey: ["envelope", projectId], queryFn: () => apiFetch(`/api/projects/${projectId}/envelope/`), staleTime: 30_000 });
  const { data: workspace } = useQuery({ queryKey: ["workspace", projectId], queryFn: () => apiFetch(`/api/projects/${projectId}/workspace/`), staleTime: 30_000 });
  const { data: toc } = useQuery({ queryKey: ["toc", projectId], queryFn: () => apiFetch(`/api/projects/${projectId}/toc/`), staleTime: 30_000 });
  const { data: partners = [] } = useQuery({ queryKey: ["partners", projectId], queryFn: () => apiFetch(`/api/projects/${projectId}/partners/`), staleTime: 30_000 });
  const { data: logframeRows = [] } = useQuery({ queryKey: ["logframe", projectId], queryFn: () => apiFetch(`/api/projects/${projectId}/logframe/`), staleTime: 30_000 });

  const mutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/transitions/`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-transitions", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
      queryClient.invalidateQueries({ queryKey: ["toc", projectId] });
      setShowForm(false);
      setTForm({ to_stage: "", transition_date: "", justification: "", document_reference: "", dual_authorized_by: "" });
      const newStage = data?.lifecycle_stage;
      if (newStage && STAGE_TOAST[newStage]) {
        setToast(STAGE_TOAST[newStage]);
      }
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

  const [showDatesForm, setShowDatesForm] = useState(false);
  const [datesForm, setDatesForm] = useState({ start_date: "", end_date: "" });

  const datesMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/dates/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowDatesForm(false);
    },
  });

  function openDatesForm() {
    setDatesForm({
      start_date: project.start_date || "",
      end_date: project.end_date || "",
    });
    setShowDatesForm(true);
  }

  function handleDatesSubmit(e) {
    e.preventDefault();
    datesMutation.mutate({
      start_date: datesForm.start_date || null,
      end_date: datesForm.end_date || null,
    });
  }

  if (isLoading) {
    return (
      <div className="loading-wrap">
        <span className="spinner" /> Chargement de la fiche projet...
      </div>
    );
  }
  if (!project) return <div className="view">Project not found.</div>;

  const otherStages = (stageChoices || []).filter((s) => s.value !== project.lifecycle_stage);
  const countries = project.countries_detail || [];
  const leadCountry = countries.find((c) => c.is_lead);
  const otherCountries = countries.filter((c) => !c.is_lead);

  return (
    <div className="view">
      <Toast toast={toast} onClose={() => setToast(null)} />
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
          {workspace?.exists && (
            <span className="badge badge-lime" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="zap" size={11} /> Workspace active
            </span>
          )}
          <span className="text-muted text-sm">
            {leadCountry && `${leadCountry.flag} ${leadCountry.name}`}
            {otherCountries.length > 0 &&
              ` + ${otherCountries.map((c) => `${c.flag} ${c.name}`).join(", ")}`}
          </span>
        </div>
      </div>

      {/* ── Bandeau de complétion ── */}
      {(() => {
        const tocNodes    = toc?.nodes?.length || 0;
        const envSources  = envelope?.financing_sources?.length || 0;
        const hasReporting = !!project.reporting_frequency;
        const hasClassif  = !!project.primary_sdg && !!project.gender_marker;

        const hasPad   = !!project.pad_reference_url;
        const hasDates = !!project.start_date && !!project.end_date;

        const items = [
          {
            key: "toc",
            icon: "globe",
            label: "Theory of Change",
            done: tocNodes > 0,
            detail: tocNodes > 0 ? `${tocNodes} node${tocNodes > 1 ? "s" : ""}` : "Not started",
            action: onOpenToC,
            actionLabel: tocNodes > 0 ? "Open" : "Start",
          },
          {
            key: "logframe",
            icon: "bar-chart",
            label: "Logical Framework",
            done: logframeRows.length > 0,
            detail: logframeRows.length > 0 ? `${logframeRows.length} indicator${logframeRows.length > 1 ? "s" : ""}` : "No indicators",
            action: onOpenLogframe,
            actionLabel: logframeRows.length > 0 ? "Open" : "Start",
          },
          {
            key: "envelope",
            icon: "wallet",
            label: "Financial Envelope",
            done: envSources > 0,
            detail: envSources > 0 ? `${envSources} source${envSources > 1 ? "s" : ""} · ${Number(envelope?.total_amount_usd || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD` : "No sources",
            action: null,
          },
          {
            key: "partners",
            icon: "users",
            label: "Implementing Partners",
            done: partners.length > 0,
            detail: partners.length > 0 ? `${partners.length} partner${partners.length > 1 ? "s" : ""}` : "None assigned",
            action: null,
          },
          {
            key: "classif",
            icon: "layers",
            label: "Classification",
            done: hasClassif,
            detail: hasClassif ? "SDG & gender marker set" : "Incomplete",
            action: null,
          },
          {
            key: "reporting",
            icon: "trending-up",
            label: "Reporting",
            done: hasReporting,
            detail: hasReporting ? project.reporting_frequency_display : "Not configured",
            action: null,
          },
          {
            key: "pad",
            icon: "file-text",
            label: "PAD Document",
            done: hasPad,
            detail: hasPad ? project.pad_reference_name : "Not uploaded",
            action: null,
          },
          {
            key: "dates",
            icon: "calendar",
            label: "Project Dates",
            done: hasDates,
            detail: hasDates
              ? `${new Date(project.start_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} → ${new Date(project.end_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`
              : "Start / end dates missing",
            action: null,
          },
        ];

        const doneCount = items.filter((i) => i.done).length;
        const pct = Math.round((doneCount / items.length) * 100);

        return (
          <div style={{
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-3)",
            padding: "var(--s-3) var(--s-4)",
            marginBottom: "var(--s-4)",
          }}>
            {/* Header barre */}
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                Project setup — {doneCount}/{items.length} sections completed
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? "var(--lime-dark, var(--lime))" : "var(--text-muted)" }}>
                {pct}%
              </span>
            </div>
            {/* Barre de progression */}
            <div style={{ height: 4, background: "var(--rule)", borderRadius: 2, marginBottom: 14, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: "var(--lime, #A4C53F)",
                borderRadius: 2, transition: "width 0.4s ease",
              }} />
            </div>
            {/* Grille des sections */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {items.map((item) => (
                <div key={item.key} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px",
                  background: item.done ? "color-mix(in srgb, var(--lime) 8%, var(--surface))" : "var(--surface)",
                  border: `1px solid ${item.done ? "color-mix(in srgb, var(--lime) 30%, transparent)" : "var(--rule)"}`,
                  borderRadius: "var(--r-2)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: item.done ? "var(--lime, #A4C53F)" : "var(--rule)",
                    color: item.done ? "#fff" : "var(--text-muted)",
                  }}>
                    {item.done
                      ? <Icon name="check" size={13} />
                      : <Icon name={item.icon} size={13} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.detail}</div>
                  </div>
                  {item.action && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: "2px 8px", flexShrink: 0 }}
                      onClick={item.action}>
                      {item.actionLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-2 mb-3">
        <div className="card card-flush">
          <div className="card-header">
            <h2 className="card-title"><Icon name="tag" size={15} style={{marginRight:6}} />Identity &amp; Scope</h2>
          </div>
          <div className="card-body">
            <div className="dl">
              <Dt term="Internal Code">
                <span className="text-mono">{project.code}</span>
              </Dt>
              <Dt term="Official Reference">{project.official_reference_number}</Dt>
              <Dt term="Lead Country">
                {leadCountry ? `${leadCountry.flag} ${leadCountry.name}` : "—"}
              </Dt>
              <Dt term="Other Countries">
                {otherCountries.length > 0
                  ? otherCountries.map((c) => `${c.flag} ${c.name}`).join(", ")
                  : "—"}
              </Dt>
              <Dt term="Regional Hub">{project.hub_name || "—"}</Dt>
              <Dt term="Indicative Budget">
                {project.budget_amount
                  ? `${Number(project.budget_amount).toLocaleString("fr-FR")} USD`
                  : "—"}
              </Dt>
              <Dt term="Registered by">{project.created_by_email}</Dt>
            </div>
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="layers" size={15} style={{marginRight:6}} />Classification</h2>
              <div className="card-sub">SF-2 · required at BED Approved gate</div>
            </div>
            {!showClassificationForm && (
              <button className="btn btn-primary btn-sm" onClick={openClassificationForm}>
                Edit
              </button>
            )}
          </div>
          <div className="card-body">
            {showClassificationForm ? (
              <form onSubmit={handleClassificationSubmit}>
                <div className="grid grid-2">
                  <div className="field">
                    <label className="field-label" htmlFor="cPrimarySector">Primary Sector</label>
                    <select
                      id="cPrimarySector"
                      className="field-select"
                      value={cForm.primary_sector}
                      onChange={(e) => setCForm({ ...cForm, primary_sector: e.target.value })}
                    >
                      <option value="">Select</option>
                      {sectors?.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="cContribSectors">Contributing Sectors</label>
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
                    <label className="field-label" htmlFor="cPrimarySdg">Primary SDG</label>
                    <select
                      id="cPrimarySdg"
                      className="field-select"
                      value={cForm.primary_sdg}
                      onChange={(e) => setCForm({ ...cForm, primary_sdg: e.target.value })}
                    >
                      <option value="">Select</option>
                      {sdgs?.map((s) => (
                        <option key={s.number} value={s.number}>SDG {s.number} — {s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="cContribSdgs">Contributing SDGs</label>
                    <select
                      id="cContribSdgs"
                      className="field-select field-multi"
                      multiple
                      value={cForm.contributing_sdg_ids.map(String)}
                      onChange={(e) => handleMultiSelect("contributing_sdg_ids", e)}
                    >
                      {contributingSdgChoices.map((s) => (
                        <option key={s.number} value={s.number}>SDG {s.number} — {s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="genderMarker">Gender Marker</label>
                    <select
                      id="genderMarker"
                      className="field-select"
                      value={cForm.gender_marker}
                      onChange={(e) => setCForm({ ...cForm, gender_marker: e.target.value })}
                    >
                      <option value="">Select</option>
                      {classificationChoices?.gender_marker.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="modality">Implementation Modality</label>
                    <select
                      id="modality"
                      className="field-select"
                      value={cForm.implementation_modality}
                      onChange={(e) => setCForm({ ...cForm, implementation_modality: e.target.value })}
                    >
                      <option value="">Select</option>
                      {classificationChoices?.implementation_modality.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="typology">Geographic Typology</label>
                    <select
                      id="typology"
                      className="field-select"
                      value={cForm.geographic_typology}
                      onChange={(e) => setCForm({ ...cForm, geographic_typology: e.target.value })}
                    >
                      <option value="">Select</option>
                      {classificationChoices?.geographic_typology.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="fragility">Fragility Status</label>
                    <select
                      id="fragility"
                      className="field-select"
                      value={cForm.fragility_status}
                      onChange={(e) => setCForm({ ...cForm, fragility_status: e.target.value })}
                    >
                      <option value="">Select</option>
                      {classificationChoices?.fragility_status.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="risk">Risk Rating</label>
                    <select
                      id="risk"
                      className="field-select"
                      value={cForm.risk_rating}
                      onChange={(e) => setCForm({ ...cForm, risk_rating: e.target.value })}
                    >
                      <option value="">Select</option>
                      {classificationChoices?.risk_rating.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="themes">Cross-Cutting Themes</label>
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
                    {classificationMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setShowClassificationForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="dl">
                <Dt term="Primary Sector">
                  {project.primary_sector_name ? (
                    <span className="row" style={{ gap: 8, alignItems: "center" }}>
                      <SectorIcon name={project.primary_sector_icon} color={project.primary_sector_color} size={24} />
                      {project.primary_sector_name}
                    </span>
                  ) : "—"}
                </Dt>
                <Dt term="Contributing Sectors">
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
                <Dt term="Primary SDG">
                  {project.primary_sdg ? (
                    <span className="row" style={{ gap: 8, alignItems: "center" }}>
                      <img
                        className="sdg-icon"
                        src={`/logos/sdg/${project.primary_sdg}.png`}
                        alt={`SDG ${project.primary_sdg}`}
                        style={{ width: 24, height: 24 }}
                      />
                      {`SDG ${project.primary_sdg} — ${project.primary_sdg_name}`}
                    </span>
                  ) : "—"}
                </Dt>
                <Dt term="Contributing SDGs">
                  {project.contributing_sdgs_detail?.length ? (
                    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                      {project.contributing_sdgs_detail.map((s) => (
                        <span key={s.number} className="row" style={{ gap: 6, alignItems: "center" }}>
                          <img
                            className="sdg-icon"
                            src={`/logos/sdg/${s.number}.png`}
                            alt={`SDG ${s.number}`}
                            style={{ width: 20, height: 20 }}
                          />
                          {`SDG ${s.number} — ${s.name}`}
                        </span>
                      ))}
                    </div>
                  ) : "—"}
                </Dt>
                <Dt term="Gender Marker">{project.gender_marker_display || "—"}</Dt>
                <Dt term="Modality">{project.implementation_modality_display || "—"}</Dt>
                <Dt term="Geographic Typology">{project.geographic_typology_display || "—"}</Dt>
                <Dt term="Cross-Cutting Themes">{project.cross_cutting_theme_names?.join(", ") || "—"}</Dt>
                <Dt term="Fragility">{project.fragility_status_display || "—"}</Dt>
                <Dt term="Risk Rating">{project.risk_rating_display || "—"}</Dt>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SF-6 — Enveloppe financiere */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="wallet" size={15} style={{marginRight:6}} />Financial Envelope</h2>
            <div className="card-sub">SF-6 · LLF2 Blended Finance · Indicative — detail in Module 9</div>
          </div>
        </div>
        <FinancialEnvelope projectId={project.id} canEdit={canEdit} />
      </div>
      {/* SF-3 — Partenaires d'exécution */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Icon name="users" size={15} style={{ marginRight: 6 }} />
              Implementing Partners
            </h2>
            <div className="card-sub">
              SF-3 · Executing agencies · Budget delegation — detail in Module 9
            </div>
          </div>
        </div>
        <ImplementingPartners projectId={project.id} canEdit={canEdit} envelopeTotal={envelope?.total_amount_usd} />
      </div>

      {/* SF-7 — Périmètre géographique GADM */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Icon name="map-pin" size={15} style={{ marginRight: 6 }} />
              Geographic Scope
            </h2>
            <div className="card-sub">
              SF-7 · GADM Admin 1/2 · Inherited by M5 (mapping) at Effective stage
            </div>
          </div>
          <span className="badge text-mono text-xs">
            {project.countries_detail?.map((c) => c.name).join(", ")}
          </span>
        </div>
        <GeographicScope
          projectId={project.id}
          countries={project.countries_detail?.map((c) => ({ iso3: c.iso3 || c.name, name: c.name, flag: c.flag }))}
          canEdit={canEdit}
        />
      </div>

      {/* SF-1 Etape 2 — Theorie du Changement */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="globe" size={15} style={{marginRight:6}} />Theory of Change</h2>
            <div className="card-sub">
              SF-1 · Step 2 · BRQ-1.35 — required from Pipeline Taskforce Approved
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onOpenToC}>
            Open
          </button>
        </div>
      </div>

      {/* Module 2 — Cadre logique */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="bar-chart" size={15} style={{marginRight:6}} />Logical Framework (Logframe)</h2>
            <div className="card-sub">
              Module 2 · LLF2 catalogue indicators · Baseline and targets
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onOpenLogframe}>
            Open
          </button>
        </div>
      </div>

      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="git-branch" size={15} style={{marginRight:6}} />Lifecycle</h2>
            <div className="card-sub">
              Immutable audit trail · forward-only progression, dual authorisation at gates
            </div>
          </div>
          {!showForm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
              Change stage
            </button>
          )}
        </div>

        <div className="card-body">
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-3)",
              padding: "var(--s-3)",
              marginBottom: "var(--s-4)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="card-sub" style={{ marginBottom: 8 }}>
                  Start / end dates · indicative duration accepted pre-pipeline, required from
                  BED Approved
                </div>
                {!showDatesForm && (
                  <div className="dl">
                    <Dt term="Start Date">
                      {project.start_date ? new Date(project.start_date).toLocaleDateString("fr-FR") : "—"}
                    </Dt>
                    <Dt term="End Date">
                      {project.end_date ? new Date(project.end_date).toLocaleDateString("fr-FR") : "—"}
                    </Dt>
                  </div>
                )}
              </div>
              {!showDatesForm && (
                <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={openDatesForm}>
                  <Icon name="pencil" size={14} /> Edit
                </button>
              )}
            </div>

            {showDatesForm && (
              <form onSubmit={handleDatesSubmit} className="mt-2">
                <div className="grid grid-2">
                  <div className="field">
                    <label className="field-label" htmlFor="startDate">Start Date</label>
                    <input
                      id="startDate"
                      className="field-input"
                      type="date"
                      value={datesForm.start_date}
                      onChange={(e) => setDatesForm({ ...datesForm, start_date: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="endDate">End Date</label>
                    <input
                      id="endDate"
                      className="field-input"
                      type="date"
                      value={datesForm.end_date}
                      onChange={(e) => setDatesForm({ ...datesForm, end_date: e.target.value })}
                    />
                  </div>
                </div>
                {datesMutation.isError && (
                  <div className="field-error mb-3">{JSON.stringify(datesMutation.error.detail)}</div>
                )}
                <div className="row">
                  <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} type="submit" disabled={datesMutation.isPending}>
                    <Icon name="check" size={14} /> {datesMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} type="button" onClick={() => setShowDatesForm(false)}>
                    <Icon name="x" size={14} /> Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {showForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({ ...tForm, transition_date: tForm.transition_date || null, dual_authorized_by: tForm.dual_authorized_by || null });
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
                    New stage <span className="req">*</span>
                  </label>
                  <select
                    id="toStage"
                    className="field-select"
                    value={tForm.to_stage}
                    onChange={(e) => setTForm({ ...tForm, to_stage: e.target.value })}
                    required
                  >
                    <option value="">Select</option>
                    {otherStages.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="transDate">
                    Transition date <span className="req">*</span>
                  </label>
                  <input
                    id="transDate"
                    className="field-input"
                    type="date"
                    value={tForm.transition_date}
                    onChange={(e) => setTForm({ ...tForm, transition_date: e.target.value })}
                    required
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="dual">
                    Second approver
                  </label>
                  <select
                    id="dual"
                    className="field-select"
                    value={tForm.dual_authorized_by}
                    onChange={(e) => setTForm({ ...tForm, dual_authorized_by: e.target.value })}
                  >
                    <option value="">None</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                  <span className="field-help">
                    Required at the TRC / IC / BED gates and for any rollback.
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
                  placeholder="Required for a rollback."
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="docref">
                  Document reference
                </label>
                <input
                  id="docref"
                  className="field-input"
                  value={tForm.document_reference}
                  onChange={(e) => setTForm({ ...tForm, document_reference: e.target.value })}
                  placeholder="e.g. Investment Committee Minutes 2026-03"
                />
              </div>

              {mutation.isError && (
                <div className="field-error mb-3">
                  {[].concat(mutation.error.detail?.detail || mutation.error.detail).join(" ")}
                </div>
              )}

              <div className="row">
                <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Saving..." : "Confirm Change"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {transitions?.length === 0 && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No transition recorded — the project is at its initial stage.
            </p>
          )}

          {transitions?.length > 0 && (() => {
            const lastId = transitions[0]?.id; // ordonné -transitioned_at, donc [0] = le plus récent
            return (
              <div className="timeline">
                {transitions.map((t) => {
                  const isLast = t.id === lastId;
                  return (
                    <div className="timeline-item" key={t.id}>
                      <div className="timeline-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span>{t.from_stage_display} → <strong>{t.to_stage_display}</strong></span>
                        {canEdit && isLast && (
                          <span className="row" style={{ gap: 4 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                              onClick={() => {
                                const justification = window.prompt("Edit justification:", t.justification || "");
                                if (justification === null) return;
                                apiFetch(`/api/projects/${projectId}/transitions/${t.id}/`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ justification }),
                                }).then(() => queryClient.invalidateQueries({ queryKey: ["project-transitions", projectId] }));
                              }}
                            >
                              <Icon name="pencil" size={11} /> Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: "2px 8px", color: "var(--danger, #dc2626)" }}
                              onClick={() => {
                                if (!window.confirm(`Delete this transition (${t.from_stage_display} → ${t.to_stage_display})? The project will revert to "${t.from_stage_display}".`)) return;
                                apiFetch(`/api/projects/${projectId}/transitions/${t.id}/`, { method: "DELETE" })
                                  .then(() => {
                                    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                                    queryClient.invalidateQueries({ queryKey: ["project-transitions", projectId] });
                                    queryClient.invalidateQueries({ queryKey: ["projects"] });
                                    queryClient.invalidateQueries({ queryKey: ["workspace", projectId] });
                                    setToast({ type: "warning", title: "Transition deleted", message: `Project reverted to "${t.from_stage_display}".` });
                                  });
                              }}
                            >
                              <Icon name="trash" size={11} /> Delete
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="timeline-meta">
                        {new Date(t.transitioned_at).toLocaleString("fr-FR")} · {t.transitioned_by_email}
                        {t.dual_authorized_by_email && (
                          <> · co-approuvé par {t.dual_authorized_by_email}</>
                        )}
                      </div>
                      {t.justification && <div className="timeline-note">{t.justification}</div>}
                      {t.document_reference && (
                        <div className="timeline-meta text-mono">{t.document_reference}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* SF-1 Etape 1 — Reference PAD */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="file-text" size={15} style={{marginRight:6}} />PAD Document</h2>
            <div className="card-sub">
              SF-1 · Reference document — AI extraction (BRQ-1.14) not yet active
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
                  {padUploadMutation.isPending ? "Uploading..." : "Replace"}
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
                  {padDeleteMutation.isPending ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <label className="btn btn-primary btn-sm" style={{ cursor: "pointer" }}>
                {padUploadMutation.isPending ? "Uploading..." : "Upload PAD (PDF)"}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePadFileChange}
                  style={{ display: "none" }}
                />
              </label>
            </div>
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

      {/* SF-1 Etape 5 — Reporting */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="trending-up" size={15} style={{marginRight:6}} />Reporting</h2>
            <div className="card-sub">SF-5 · Reporting cycle and schedule</div>
          </div>
          {!showReportingForm && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openReportingForm}>
              <Icon name="pencil" size={13} /> Edit
            </button>
          )}
        </div>
        <div className="card-body">
          {showReportingForm ? (
            <form onSubmit={handleReportingSubmit}>
              <div className="grid grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="reportingFreq">Frequency</label>
                  <select
                    id="reportingFreq"
                    className="field-select"
                    value={rForm.reporting_frequency}
                    onChange={(e) => setRForm({ ...rForm, reporting_frequency: e.target.value })}
                  >
                    <option value="">Select</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semi_annual">Semi-annual</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="nextDue">First Deadline</label>
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
                  {reportingMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowReportingForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="dl">
              <Dt term="Frequency">{project.reporting_frequency_display || "—"}</Dt>
              <Dt term="First Deadline">
                {project.next_reporting_due
                  ? new Date(project.next_reporting_due).toLocaleDateString("fr-FR")
                  : "—"}
              </Dt>
            </div>
          )}
        </div>
      </div>

      {/* SF-5 — Calendrier des périodes */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="calendar" size={15} style={{ marginRight: 6 }} />Reporting Schedule</h2>
            <div className="card-sub">SF-5 · Auto-generated periods · Submit and approval tracking</div>
          </div>
        </div>
        <ReportingSchedule
          projectId={project.id}
          reportingFrequency={project.reporting_frequency}
          projectEndDate={project.end_date}
          nextReportingDue={project.next_reporting_due}
          canEdit={canEdit}
        />
      </div>

    </div>
  );
}
