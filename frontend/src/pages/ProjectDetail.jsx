import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "../api";
import SectorIcon from "../components/SectorIcon";
import FinancialEnvelope from "../components/FinancialEnvelope";
import ImplementingPartners from "../components/ImplementingPartners";
import GeographicScope from "../components/GeographicScope";
import ReportingSchedule from "../components/ReportingSchedule";
import ResultsEntry from "../components/ResultsEntry";
import TheoryOfChange from "../pages/TheoryOfChange.jsx";
import Logframe from "../pages/Logframe.jsx";
import Workplan from "../pages/Workplan.jsx";
import Toast from "../components/Toast";
import { useDialog, DialogModal } from "../components/Dialog.jsx";
import Icon from "../components/Icon";
import { fmtNum, fmtPct, fmtCurrency } from "../utils.js";

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

// Project-scope sections — consumed both by this page and by the AppShell's
// project sidebar (sidebar B), which renders them with their lock state,
// grouped under four pillars. Module level so the shell never duplicates
// the rules.
export const PROJECT_PILLARS = [
  { key: "identity", label: "Identity & lifecycle" },
  { key: "results",  label: "What it aims to achieve" },
  { key: "delivery", label: "What gets done" },
  { key: "control",  label: "Money & control" },
];

export const PROJECT_TABS = [
  { key: "overview",   label: "Overview",         icon: "info-circle", pillar: "identity" },
  { key: "lifecycle",  label: "Lifecycle",        icon: "zap",         pillar: "identity" },
  { key: "toc",        label: "Theory of Change", icon: "globe",       pillar: "results"  },
  { key: "logframe",   label: "Logframe",         icon: "bar-chart-2", pillar: "results"  },
  { key: "results",    label: "Results",          icon: "trending-up", pillar: "results"  },
  { key: "workplan",   label: "Workplan",         icon: "layout",      pillar: "delivery" },
  { key: "geographic", label: "Geographic Scope", icon: "map-pin",     pillar: "delivery" },
  { key: "partners",   label: "Partners",         icon: "users",       pillar: "delivery" },
  { key: "financial",  label: "Financial",        icon: "database",    pillar: "control"  },
  { key: "reporting",  label: "Reporting",        icon: "calendar",    pillar: "control"  },
  { key: "documents",  label: "Documents",        icon: "folder",      pillar: "control"  },
];

// Stage order for comparisons (SF-4 lifecycle)
const STAGE_ORDER = [
  "concept_note", "pipeline_taskforce_review", "pipeline_taskforce_approved",
  "preparation_identification", "trc_endorsed", "ic_approved", "appraisal",
  "bed_approved", "effective", "implementing", "mid_term_review",
  "substantially_complete", "closed",
];
const stageIdx = (s) => STAGE_ORDER.indexOf(s);

// Per-section lock rules, derived from the project detail payload alone.
export function computeTabLocks(project) {
  const currentIdx = stageIdx(project?.lifecycle_stage || "concept_note");
  const atLeast = (s) => currentIdx >= stageIdx(s);
  const hasWorkspace = !!project?.has_workspace;
  const hasTocNodes  = (project?.toc_node_count || 0) > 0;
  return {
    overview:   { locked: false },
    lifecycle:  { locked: false },
    documents:  { locked: false },
    financial:  {
      locked: !atLeast("pipeline_taskforce_review"),
      reason: "Available from Pipeline Taskforce Review stage",
      depends: "Lifecycle stage: Pipeline Taskforce Review",
    },
    toc: {
      locked: !atLeast("pipeline_taskforce_approved"),
      reason: "Available from Pipeline Taskforce Approved stage",
      depends: "Lifecycle stage: Pipeline Taskforce Approved",
    },
    logframe: {
      locked: !hasTocNodes,
      reason: "Requires Theory of Change to be started first",
      depends: "Theory of Change: at least one node defined",
    },
    results: {
      locked: !hasWorkspace,
      reason: "Available when project reaches Effective stage",
      depends: "Lifecycle stage: Effective (workspace activated)",
    },
    workplan: {
      locked: !hasWorkspace,
      reason: "Available when project reaches Effective stage",
      depends: "Lifecycle stage: Effective (workspace activated)",
    },
    geographic: {
      locked: !atLeast("preparation_identification"),
      reason: "Available from Preparation/Identification stage",
      depends: "Lifecycle stage: Preparation/Identification",
    },
    partners: {
      locked: !atLeast("appraisal"),
      reason: "Available from Appraisal stage",
      depends: "Lifecycle stage: Appraisal",
    },
    reporting: {
      locked: !atLeast("bed_approved"),
      reason: "Available from BED Approved gate",
      depends: "Lifecycle stage: BED Approved",
    },
  };
}

export default function ProjectDetail({ projectId, activeTab = "overview", onTabChange = () => {}, onDeleted, onOpenPIRS, canEdit = false }) {
  const queryClient = useQueryClient();
  const dialog = useDialog();
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [tForm, setTForm] = useState({
    to_stage: "",
    justification: "",
    document_reference: "",
    dual_authorized_by: "",
  });
  const [showBasicForm, setShowBasicForm] = useState(false);
  const [bForm, setBForm] = useState({ name: "", acronym: "", official_reference_number: "", countryIds: [], leadCountryId: "" });
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
    rio_marker_mitigation: "not_targeted",
    rio_marker_adaptation: "not_targeted",
    rio_marker_biodiversity: "not_targeted",
    rio_marker_desertification: "not_targeted",
    rio_marker_water: "not_targeted",
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
  const { data: refCountries } = useQuery({ queryKey: ["ref-countries"], queryFn: () => apiFetch("/api/reference/countries/") });
  const GATE_STAGES_SET = ["trc_endorsed", "ic_approved", "bed_approved"];
  const isGate = GATE_STAGES_SET.includes(tForm.to_stage);
  const needsDualAuth = isGate;
  const needsJustification = true; // toujours requis

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

  function openBasicForm() {
    setBForm({
      name: project.name || "",
      acronym: project.acronym || "",
      official_reference_number: project.official_reference_number || "",
      countryIds: project.countries_detail?.map(c => String(c.id)) || [],
      leadCountryId: String(project.countries_detail?.find(c => c.is_lead)?.id || ""),
    });
    setShowBasicForm(true);
  }

  const basicMutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${project.id}/basic/`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowBasicForm(false);
      setToast({ type: "success", message: "Basic identity updated." });
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
      rio_marker_mitigation:     project.rio_marker_mitigation     || "not_targeted",
      rio_marker_adaptation:     project.rio_marker_adaptation     || "not_targeted",
      rio_marker_biodiversity:   project.rio_marker_biodiversity   || "not_targeted",
      rio_marker_desertification:project.rio_marker_desertification|| "not_targeted",
      rio_marker_water:          project.rio_marker_water          || "not_targeted",
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
      rio_marker_mitigation: cForm.rio_marker_mitigation,
      rio_marker_adaptation: cForm.rio_marker_adaptation,
      rio_marker_biodiversity: cForm.rio_marker_biodiversity,
      rio_marker_desertification: cForm.rio_marker_desertification,
      rio_marker_water: cForm.rio_marker_water,
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

  const deleteProjectMutation = useMutation({
    mutationFn: () => apiFetch(`/api/projects/${projectId}/`, { method: "DELETE" }),
    onSuccess: () => {
      // Leave the page first: removing the per-project queries while this
      // component is still mounted would refetch them and render a 404.
      onDeleted?.();
      queryClient.removeQueries({ queryKey: ["project", projectId] });
      queryClient.removeQueries({ queryKey: ["project-transitions", projectId] });
      queryClient.removeQueries({ queryKey: ["workspace", projectId] });
      queryClient.removeQueries({ queryKey: ["toc", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  // Double confirmation: a warning dialog, then the project code typed back.
  async function handleDeleteProject() {
    const code = project?.code || String(projectId);
    const ok = await dialog.confirm(
      `This permanently deletes project ${code} and everything attached to it: countries, stage transitions, ` +
      `theory of change, logframe, results, workplan, reporting periods, partners and the PAD file. ` +
      `This action cannot be undone.`,
      { title: `Delete project ${code}?`, confirmLabel: "Continue", danger: true },
    );
    if (!ok) return;
    const typed = await dialog.prompt(
      `Type the project code (${code}) to confirm the deletion.`,
      { title: "Confirm deletion", confirmLabel: "Delete project", danger: true },
    );
    if (typed === null || typed === undefined) return;
    if (String(typed).trim() !== code) {
      await dialog.alert("The code does not match. Nothing was deleted.", { title: "Deletion cancelled" });
      return;
    }
    deleteProjectMutation.mutate();
  }

  function handlePadFileChange(e) {
    const file = e.target.files?.[0];
    if (file) padUploadMutation.mutate(file);
    e.target.value = "";
  }

  const [showReportingForm, setShowReportingForm] = useState(false);
  const [rForm, setRForm] = useState({ reporting_frequency: "", next_reporting_due: "", end_date: "" });

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
      end_date: project.end_date || "",
    });
    setShowReportingForm(true);
  }

  function handleReportingSubmit(e) {
    e.preventDefault();
    reportingMutation.mutate({
      reporting_frequency: rForm.reporting_frequency || null,
      next_reporting_due: rForm.next_reporting_due || null,
      end_date: rForm.end_date || null,
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


  // Sections et verrous : definis au niveau module (PROJECT_TABS,
  // computeTabLocks) car la sidebar projet du AppShell les affiche aussi.
  const currentIdx = stageIdx(project?.lifecycle_stage || "concept_note");
  const atLeast = (s) => currentIdx >= stageIdx(s);
  const TAB_LOCKS = computeTabLocks(project);

  // ── Règles de modification par section ──────────────────────────────────
  // Overview/Classification : modifiable avant Effective
  const canEditClassification = !atLeast("effective");
  // Basic Identity : modifiable avant BED Approved
  const canEditBasicIdentity = !atLeast("bed_approved");
  // Financial : modifiable avant BED Approved
  const canEditFinancial = !atLeast("bed_approved");
  // Reporting config : modifiable avant Effective
  const canEditReporting = !atLeast("effective");
  // Geographic : modifiable avant Effective
  const canEditGeographic = !atLeast("effective");

  // ── Bannière globale selon le stade ─────────────────────────────────────
  const STAGE_BANNERS = {
    effective: {
      color: "#1B5A8C", bg: "#e0ebf6", border: "#93c5fd",
      icon: "check-circle",
      text: "This project is Effective — the Theory of Change, classification and reporting configuration are now locked. Data entry and partners remain editable.",
    },
    implementing: {
      color: "#166534", bg: "#dcfce7", border: "#86efac",
      icon: "trending-up",
      text: "This project is under implementation. Results entry is open. Structural fields are locked.",
    },
    substantially_complete: {
      color: "#854d0e", bg: "#fef9c3", border: "#fde047",
      icon: "alert-triangle",
      text: "This project is substantially complete. Only evidence and final reports can be added.",
    },
    closed: {
      color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb",
      icon: "lock",
      text: "This project is closed. All fields are read-only.",
    },
  };
  const stageBanner = project ? STAGE_BANNERS[project.lifecycle_stage] : null;

  const GLOBAL_BANNER = stageBanner && (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 14px", borderRadius: 8, marginBottom: 16,
      background: stageBanner.bg,
      border: `1px solid ${stageBanner.border}`,
      color: stageBanner.color, fontSize: 13,
    }}>
      <Icon name={stageBanner.icon} size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{stageBanner.text}</span>
    </div>
  );



  // Panneau affiché quand un tab verrouillé est cliqué
  function LockedTabPanel({ tabKey }) {
    const lock = TAB_LOCKS[tabKey] || {};
    return (
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"48px 24px", textAlign:"center",
        background:"#fafaf8", border:"1px solid #e5e7eb", borderRadius:12,
      }}>
        <div style={{
          width:56, height:56, borderRadius:"50%",
          background:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center",
          marginBottom:16,
        }}>
          <Icon name="lock" size={24} style={{ color:"#9ca3af" }} />
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:"#374151", marginBottom:8 }}>
          This section is not yet available
        </div>
        <div style={{ fontSize:13, color:"#6b7280", marginBottom:16, maxWidth:400 }}>
          {lock.reason}
        </div>
        <div style={{
          display:"inline-flex", alignItems:"center", gap:8,
          padding:"8px 16px", borderRadius:8,
          background:"#f0f6dc", border:"1px solid #A4C53F40",
          fontSize:12, color:"#7a9420",
        }}>
          <Icon name="info-circle" size={13} />
          <span><strong>Requires:</strong> {lock.depends}</span>
        </div>
      </div>
    );
  }

  // La barre d'onglets et l'en-tete projet (code, nom, retour) vivent
  // desormais dans la sidebar projet du AppShell (scope PROJECT).
  const sectionLabel = PROJECT_TABS.find((tb) => tb.key === activeTab)?.label;

  return (
    <div className="view">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <DialogModal {...dialog.dialogProps} />

      <div className="view-header">
        <div className="view-eyebrow text-mono">{project.code}</div>
        <h1 className="view-title">{sectionLabel}</h1>
      </div>

      {GLOBAL_BANNER}

      {activeTab === "overview" && (<>
      {/* ── Setup progress, one line — the sections themselves live in the
           project sidebar, so the old per-section grid is gone ── */}
      {(() => {
        const checks = [
          (toc?.nodes?.length || 0) > 0,                        // Theory of Change
          logframeRows.length > 0,                              // Logframe
          (envelope?.financing_sources?.length || 0) > 0,       // Financial envelope
          partners.length > 0,                                  // Partners
          !!project.primary_sdg && !!project.gender_marker,     // Classification
          !!project.reporting_frequency,                        // Reporting
          !!project.pad_reference_url,                          // PAD document
          !!(project.start_date && project.end_date),           // Dates
        ];
        const done = checks.filter(Boolean).length;
        const pct = Math.round((done / checks.length) * 100);
        return (
          <div className="row" style={{ gap: 10, alignItems: "center", marginBottom: "var(--s-4)", fontSize: 12, color: "var(--text-muted)" }}>
            <span style={{ fontWeight: 600 }}>Project setup — {done}/{checks.length} sections completed</span>
            <div style={{ flex: 1, maxWidth: 220, height: 4, background: "var(--rule)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--lime, #A4C53F)", borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
            <span style={{ fontWeight: 700, color: pct === 100 ? "var(--lime-dark, var(--lime))" : "var(--text-muted)" }}>{pct}%</span>
          </div>
        );
      })()}

      <div className="grid grid-2 mb-3">
        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="tag" size={15} style={{marginRight:6}} />Identity &amp; Scope</h2>
              <div className="card-sub">SF-1 · Basic project identity</div>
            </div>
            {!showBasicForm && canEditBasicIdentity && (
              <button className="btn btn-primary btn-sm" onClick={openBasicForm}>
                <Icon name="pencil" size={13} /> Edit
              </button>
            )}
            {!showBasicForm && !canEditBasicIdentity && (
              <span style={{ fontSize:11, color:"#9ca3af", display:"flex", alignItems:"center", gap:4 }}>
                <Icon name="lock" size={11} /> Locked at BED Approved
              </span>
            )}
          </div>
          <div className="card-body">
            {showBasicForm ? (
              <form onSubmit={e => { e.preventDefault(); basicMutation.mutate({
                name: bForm.name,
                acronym: bForm.acronym || "",
                official_reference_number: bForm.official_reference_number || "",
                country_ids: bForm.countryIds.map(Number),
                lead_country_id: Number(bForm.leadCountryId || bForm.countryIds[0]),
              }); }}>
                <div className="field">
                  <label className="field-label">Project name <span className="req">*</span></label>
                  <input className="field-input" value={bForm.name}
                    onChange={e => setBForm({...bForm, name: e.target.value})} required />
                </div>
                <div className="field">
                  <label className="field-label">Acronym</label>
                  <input className="field-input" value={bForm.acronym} maxLength={20}
                    onChange={e => setBForm({...bForm, acronym: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Official reference number</label>
                  <input className="field-input" value={bForm.official_reference_number}
                    placeholder="ex. P-SN-AAG-001"
                    onChange={e => setBForm({...bForm, official_reference_number: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Countries <span className="req">*</span></label>
                  <select className="field-select field-multi" multiple
                    value={bForm.countryIds}
                    onChange={e => setBForm({...bForm, countryIds: Array.from(e.target.selectedOptions).map(o => o.value)})}>
                    {refCountries?.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                  <span className="field-help">Ctrl/Cmd + click for multi-country.</span>
                </div>
                {bForm.countryIds.length > 1 && (
                  <div className="field">
                    <label className="field-label">Lead country <span className="req">*</span></label>
                    <select className="field-select" value={bForm.leadCountryId}
                      onChange={e => setBForm({...bForm, leadCountryId: e.target.value})}>
                      {refCountries?.filter(c => bForm.countryIds.includes(String(c.id))).map(c =>
                        <option key={c.id} value={String(c.id)}>{c.name}</option>
                      )}
                    </select>
                  </div>
                )}
                {basicMutation.isError && (
                  <div className="field-error mb-2">{JSON.stringify(basicMutation.error?.detail)}</div>
                )}
                <div className="row mt-2">
                  <button className="btn btn-primary row" style={{gap:6}} type="submit"
                    disabled={basicMutation.isPending}>
                    <Icon name="check" size={13} /> {basicMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost" type="button"
                    onClick={() => setShowBasicForm(false)}>Cancel</button>
                </div>
              </form>
            ) : (
            <div className="dl">
              <Dt term="Internal Code">
                <span className="text-mono">{project.code}</span>
              </Dt>
              <Dt term="Official Reference">{project.official_reference_number || "—"}</Dt>
              <Dt term="Lead Country">
                {leadCountry ? `${leadCountry.flag} ${leadCountry.name}` : "—"}
              </Dt>
              <Dt term="Other Countries">
                {otherCountries.length > 0
                  ? otherCountries.map((c) => `${c.flag} ${c.name}`).join(", ")
                  : "—"}
              </Dt>
              <Dt term="Regional Hub">{project.hub_name || "—"}</Dt>
              <Dt term="Start date">{project.start_date || "—"}</Dt>
              <Dt term="End date">{project.end_date || "—"}</Dt>
              <Dt term="Indicative Budget">
                {project.budget_amount
                  ? `${fmtNum(project.budget_amount)} USD`
                  : "—"}
              </Dt>
              <Dt term="Registered by">{project.created_by_email}</Dt>
            </div>
            )}
          </div>
        </div>

        <div className="card card-flush">
          <div className="card-header">
            <div>
              <h2 className="card-title"><Icon name="layers" size={15} style={{marginRight:6}} />Classification</h2>
              <div className="card-sub">SF-2 · required at BED Approved gate</div>
            </div>
            {!showClassificationForm && canEditClassification && (
              <button className="btn btn-primary btn-sm" onClick={openClassificationForm}>
                Edit
              </button>
            )}
            {!showClassificationForm && !canEditClassification && (
              <span style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="lock" size={11} /> Locked at Effective
              </span>
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

                  {/* Rio Markers */}
                </div>

                <div style={{ marginTop: "var(--s-3)" }}>
                  <div className="card-sub" style={{ marginBottom: 8 }}>Rio Markers (OECD-DAC)</div>
                  <div className="grid grid-2">
                    {[
                      ["rio_marker_mitigation",     "CC Mitigation"],
                      ["rio_marker_adaptation",      "CC Adaptation"],
                      ["rio_marker_biodiversity",    "Biodiversity"],
                      ["rio_marker_desertification", "Desertification"],
                      ["rio_marker_water",           "Water"],
                    ].map(([key, label]) => (
                      <div key={key} className="field">
                        <label className="field-label">{label}</label>
                        <select className="field-select" value={cForm[key]}
                          onChange={(e) => setCForm({ ...cForm, [key]: e.target.value })}>
                          <option value="not_targeted">Not targeted</option>
                          <option value="significant">Significant</option>
                          <option value="principal">Principal</option>
                        </select>
                      </div>
                    ))}
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
              <>
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

              {/* Rio Markers */}
              <div style={{ marginTop: 16 }}>
                <div className="card-sub" style={{ marginBottom: 8 }}>Rio Markers (OECD-DAC)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ["CC Mitigation",  project.rio_marker_mitigation],
                    ["CC Adaptation",  project.rio_marker_adaptation],
                    ["Biodiversity",   project.rio_marker_biodiversity],
                    ["Desertification", project.rio_marker_desertification],
                    ["Water",          project.rio_marker_water],
                  ].map(([label, val]) => (
                    <div key={label} style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      padding: "6px 12px", borderRadius: 8, minWidth: 100,
                      background: val === "principal" ? "#dcfce7" : val === "significant" ? "#f0f6dc" : "#f3f4f6",
                      border: `1px solid ${val === "principal" ? "#86efac" : val === "significant" ? "#A4C53F40" : "#e5e7eb"}`,
                    }}>
                      <span style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700,
                        color: val === "principal" ? "#16a34a" : val === "significant" ? "#7a9420" : "#9ca3af" }}>
                        {val === "principal" ? "Principal" : val === "significant" ? "Significant" : "Not targeted"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="card mb-3" style={{ borderColor: "var(--danger, #dc2626)" }}>
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ color: "var(--danger, #dc2626)" }}>
                <Icon name="trash" size={15} style={{ marginRight: 6 }} />Danger zone
              </h2>
              <div className="card-sub">Irreversible actions on this project</div>
            </div>
            <button
              className="btn btn-sm"
              style={{ color: "var(--danger, #dc2626)", borderColor: "var(--danger, #dc2626)" }}
              disabled={deleteProjectMutation.isPending}
              onClick={handleDeleteProject}
            >
              <Icon name="trash" size={13} /> {deleteProjectMutation.isPending ? "Deleting..." : "Delete project"}
            </button>
          </div>
          <div className="card-body">
            <p className="text-sm" style={{ margin: 0, color: "#6b7280" }}>
              Deleting the project removes all of its data (lifecycle, logframe, results, workplan, documents).
              You will be asked to confirm twice, the second time by typing the project code.
            </p>
            {deleteProjectMutation.isError && (
              <div className="text-sm" style={{ color: "var(--danger, #dc2626)", marginTop: "var(--s-2)" }}>
                {deleteProjectMutation.error?.detail || String(deleteProjectMutation.error)}
              </div>
            )}
          </div>
        </div>
      )}

      </>)}


      {activeTab === "financial" && (<>
      {TAB_LOCKS["financial"]?.locked
        ? <LockedTabPanel tabKey="financial" />
        : (<>
      {/* SF-6 — Enveloppe financiere */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="wallet" size={15} style={{marginRight:6}} />Financial Envelope</h2>
            <div className="card-sub">SF-6 · LLF2 Blended Finance · Indicative — detail in Module 9</div>
          </div>
        </div>
        <FinancialEnvelope projectId={project.id} canEdit={canEditFinancial} />
      </div>
      
      </>)}
      </>)}

      {activeTab === "partners" && (<>
      {TAB_LOCKS["partners"]?.locked
        ? <LockedTabPanel tabKey="partners" />
        : (<>
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
        <ImplementingPartners projectId={project.id} canEdit={!atLeast("effective")} envelopeTotal={envelope?.total_amount_usd} />
      </div>


      </>)}
      </>)}


      {activeTab === "geographic" && (<>
      {TAB_LOCKS["geographic"]?.locked
        ? <LockedTabPanel tabKey="geographic" />
        : (<>
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
          countries={project.countries_detail?.map((c) => ({
            iso2: c.iso2,
            iso3: c.iso3,
            name: c.name,
            flag: c.flag,
            is_lead: c.is_lead,
          }))}
          canEdit={canEditGeographic}
        />
      </div>


      </>)}
      </>)}


      {activeTab === "toc" && (<>
      {TAB_LOCKS["toc"]?.locked
        ? <LockedTabPanel tabKey="toc" />
        : (<>
      {/* SF-1 Etape 2 — Theorie du Changement */}
      <TheoryOfChange projectId={projectId} onBack={() => onTabChange("overview")} embedded={true} canEdit={canEditClassification} />


      </>)}
      </>)}


      {activeTab === "logframe" && (<>
      {TAB_LOCKS["logframe"]?.locked
        ? <LockedTabPanel tabKey="logframe" />
        : (<>
      <Logframe projectId={projectId} onBack={() => onTabChange("overview")} onOpenPIRS={onOpenPIRS} embedded={true} />


      </>)}
      </>)}


      {activeTab === "lifecycle" && (<>
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
                    Second approver {needsDualAuth && <span className="req">*</span>}
                  </label>
                  {needsDualAuth && (
                    <div style={{ fontSize:11, color:"#d97706", marginBottom:4, fontWeight:600 }}>
                      ⚠️ Gate transition — second approver required
                    </div>
                  )}
                  <select
                    id="dual"
                    className="field-select"
                    value={tForm.dual_authorized_by}
                    required={needsDualAuth}
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
                  Justification <span className="req">*</span>
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
                              onClick={async () => {
                                const justification = await dialog.prompt("Edit justification:", { title: "Edit transition", defaultValue: t.justification || "", confirmLabel: "Save" });
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
                              onClick={async () => {
                                const ok = await dialog.confirm(`The project will revert to "${t.from_stage_display}".`, { title: `Delete transition to ${t.to_stage_display}?`, confirmLabel: "Delete", danger: true }); if (!ok) return;
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


      </>)}


      {activeTab === "documents" && (<>
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


      </>)}


      {activeTab === "reporting" && (<>
      {TAB_LOCKS["reporting"]?.locked
        ? <LockedTabPanel tabKey="reporting" />
        : (<>
      {/* SF-1 Etape 5 — Reporting */}
      <div className="card card-flush mt-3">
        <div className="card-header">
          <div>
            <h2 className="card-title"><Icon name="trending-up" size={15} style={{marginRight:6}} />Reporting</h2>
            <div className="card-sub">SF-5 · Reporting cycle and schedule</div>
          </div>
          {!showReportingForm && canEditReporting && (
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={openReportingForm}>
              <Icon name="pencil" size={13} /> Edit
            </button>
          )}
          {!showReportingForm && !canEditReporting && (
            <span style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="lock" size={11} /> Locked at Effective
            </span>
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
                  <label className="field-label" htmlFor="nextDue">First Deadline <span className="req">*</span></label>
                  <input
                    id="nextDue"
                    className="field-input"
                    type="date"
                    value={rForm.next_reporting_due}
                    onChange={(e) => setRForm({ ...rForm, next_reporting_due: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="endDate">
                    Project end date <span className="req">*</span>
                  </label>
                  <input
                    id="endDate"
                    className="field-input"
                    type="date"
                    value={rForm.end_date}
                    onChange={(e) => setRForm({ ...rForm, end_date: e.target.value })}
                    required
                  />
                  <span className="field-help">Required to generate the reporting schedule.</span>
                </div>
              </div>
              {(!project.end_date) && (
                <div style={{ padding:"8px 12px", background:"#fef3c7", border:"1px solid #fcd34d",
                  borderRadius:8, fontSize:12, color:"#7a3c00", marginBottom:8 }}>
                  ⚠️ Project end date is not set — periods cannot be generated without it.
                </div>
              )}
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
          canEdit={canEditReporting}
        />
      </div>


      </>)}
      </>)}


      {activeTab === "results" && (<>
      {TAB_LOCKS["results"]?.locked
        ? <LockedTabPanel tabKey="results" />
        : (<>
      {/* ── Module 2 — Results Data Entry ─────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-header">
          <h2 className="card-title">
            <Icon name="bar-chart-2" size={15} style={{ marginRight: 6 }} />
            Results — Data Entry
          </h2>
          <div className="card-subtitle">
            Enter actual values per indicator and reporting period. RAG status is calculated automatically.
          </div>
        </div>
        <ResultsEntry projectId={projectId} canEdit={true} />
      </div>

      </>)}
      </>)}

      {activeTab === "workplan" && (<>
      {TAB_LOCKS["workplan"]?.locked
        ? <LockedTabPanel tabKey="workplan" />
        : (<>
      {/* ── Module 3 — Workplan ───────────────────────────────────────── */}
      <div className="card mt-4">
        <div className="card-header">
          <h2 className="card-title">
            <Icon name="layout" size={15} style={{ marginRight: 6 }} />
            Workplan — Activity & Milestone Tracking
          </h2>
          <div className="card-subtitle">
            Component → Sub-Component → Activity · ToC links (SF-2) · Milestones & Delay tracking
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <Workplan projectId={projectId} canEdit={canEdit} />
        </div>
      </div>

      </>)}
      </>)}


    </div>
  );
}
