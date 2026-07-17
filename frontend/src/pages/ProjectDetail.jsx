import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

const NAVY = "#1B5A8C";
const LIME = "#A4C53F";

const inputStyle = {
  width: "100%",
  padding: "0.5rem",
  marginTop: "0.25rem",
  marginBottom: "1rem",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontFamily: "Inter, sans-serif",
};

const sectionStyle = {
  border: "1px solid #eee",
  borderRadius: 8,
  padding: "1.25rem",
  marginBottom: "1.5rem",
};

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <span style={{ color: "#888", fontSize: "0.8rem", display: "block" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ProjectDetail({ projectId, onBack }) {
  const queryClient = useQueryClient();
  const [showTransitionForm, setShowTransitionForm] = useState(false);
  const [transitionForm, setTransitionForm] = useState({
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

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/identity/users/"),
  });

  const mutation = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/projects/${projectId}/transitions/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-transitions", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowTransitionForm(false);
      setTransitionForm({ to_stage: "", justification: "", document_reference: "", dual_authorized_by: "" });
    },
  });

  function handleTransitionSubmit(e) {
    e.preventDefault();
    mutation.mutate({
      to_stage: transitionForm.to_stage,
      justification: transitionForm.justification,
      document_reference: transitionForm.document_reference,
      dual_authorized_by: transitionForm.dual_authorized_by || null,
    });
  }

  if (isLoading) return <div style={{ padding: "2rem" }}>Chargement...</div>;
  if (!project) return <div style={{ padding: "2rem" }}>Projet introuvable.</div>;

  const otherStageChoices = (stageChoices || []).filter((s) => s.value !== project.lifecycle_stage);

  return (
    <div style={{ padding: "2rem", maxWidth: 800, fontFamily: "Inter, sans-serif" }}>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: NAVY, cursor: "pointer", marginBottom: "1rem" }}
      >
        ← Retour a la liste
      </button>

      <h2 style={{ color: NAVY, fontFamily: "Sora, sans-serif" }}>
        {project.code} — {project.name}
      </h2>
      <p>
        Etape actuelle :{" "}
        <strong style={{ color: LIME, background: NAVY, padding: "0.15rem 0.6rem", borderRadius: 4 }}>
          {project.lifecycle_stage_display}
        </strong>
      </p>

      <div style={sectionStyle}>
        <h3 style={{ color: NAVY, marginTop: 0 }}>Identite de base</h3>
        <Field label="Numero de reference officiel" value={project.official_reference_number} />
        <Field
          label="Pays"
          value={
            project.country_names?.length
              ? `${project.lead_country_name} (chef de file)` +
                (project.country_names.length > 1
                  ? ` + ${project.country_names.filter((c) => c !== project.lead_country_name).join(", ")}`
                  : "")
              : "—"
          }
        />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ color: NAVY, marginTop: 0 }}>Classification (SF-2)</h3>
        <Field label="Secteur primaire" value={project.primary_sector_name} />
        <Field label="Secteurs contributifs" value={project.contributing_sector_names?.join(", ")} />
        <Field label="ODD primaire" value={project.primary_sdg_name && `ODD ${project.primary_sdg} - ${project.primary_sdg_name}`} />
        <Field label="ODD contributifs" value={project.contributing_sdg_names?.join(", ")} />
        <Field label="Marqueur Genre" value={project.gender_marker} />
        <Field label="Modalite de mise en oeuvre" value={project.implementation_modality} />
        <Field label="Typologie geographique" value={project.geographic_typology} />
        <Field label="Statut de fragilite" value={project.fragility_status} />
        <Field label="Notation de risque" value={project.risk_rating} />
      </div>

      <div style={sectionStyle}>
        <h3 style={{ color: NAVY, marginTop: 0 }}>Portefeuille</h3>
        <Field label="Budget indicatif" value={project.budget_amount} />
        <Field label="Cree par" value={project.created_by_email} />
        <Field label="Cree le" value={project.created_at && new Date(project.created_at).toLocaleString()} />
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: NAVY, marginTop: 0 }}>Cycle de vie — historique des transitions (SF-4)</h3>
          {!showTransitionForm && (
            <button
              onClick={() => setShowTransitionForm(true)}
              style={{
                background: LIME, color: NAVY, border: "none", borderRadius: 6,
                padding: "0.4rem 1rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              + Transition d'etape
            </button>
          )}
        </div>

        {showTransitionForm && (
          <form onSubmit={handleTransitionSubmit} style={{ background: "#f9f9f9", padding: "1rem", borderRadius: 6, marginBottom: "1rem" }}>
            <label>
              Nouvelle etape *
              <select
                style={inputStyle}
                value={transitionForm.to_stage}
                onChange={(e) => setTransitionForm({ ...transitionForm, to_stage: e.target.value })}
                required
              >
                <option value="">-- Selectionner --</option>
                {otherStageChoices.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Justification (obligatoire pour un retour arriere)
              <textarea
                style={{ ...inputStyle, minHeight: "4rem" }}
                value={transitionForm.justification}
                onChange={(e) => setTransitionForm({ ...transitionForm, justification: e.target.value })}
              />
            </label>

            <label>
              Reference documentaire
              <input
                style={inputStyle}
                value={transitionForm.document_reference}
                onChange={(e) => setTransitionForm({ ...transitionForm, document_reference: e.target.value })}
              />
            </label>

            <label>
              Second approbateur (autorisation double — gates TRC/IC/BED et retours arriere)
              <select
                style={inputStyle}
                value={transitionForm.dual_authorized_by}
                onChange={(e) => setTransitionForm({ ...transitionForm, dual_authorized_by: e.target.value })}
              >
                <option value="">-- Aucun --</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </label>

            {mutation.isError && (
              <p style={{ color: "crimson" }}>
                Erreur : {JSON.stringify(mutation.error.detail?.detail || mutation.error.detail)}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="submit"
                disabled={mutation.isPending}
                style={{
                  background: LIME, color: NAVY, border: "none", borderRadius: 6,
                  padding: "0.5rem 1rem", fontWeight: 600, cursor: "pointer",
                }}
              >
                {mutation.isPending ? "Envoi..." : "Confirmer la transition"}
              </button>
              <button
                type="button"
                onClick={() => setShowTransitionForm(false)}
                style={{
                  background: "transparent", color: NAVY, border: `1px solid ${NAVY}`,
                  borderRadius: 6, padding: "0.5rem 1rem", cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {transitions?.length === 0 && <p style={{ color: "#888" }}>Aucune transition enregistree.</p>}

        {transitions?.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: `2px solid ${NAVY}` }}>
                <th style={{ padding: "0.4rem" }}>De</th>
                <th style={{ padding: "0.4rem" }}>Vers</th>
                <th style={{ padding: "0.4rem" }}>Par</th>
                <th style={{ padding: "0.4rem" }}>Le</th>
                <th style={{ padding: "0.4rem" }}>2e approbateur</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.4rem" }}>{t.from_stage_display}</td>
                  <td style={{ padding: "0.4rem" }}>{t.to_stage_display}</td>
                  <td style={{ padding: "0.4rem" }}>{t.transitioned_by_email}</td>
                  <td style={{ padding: "0.4rem" }}>{new Date(t.transitioned_at).toLocaleString()}</td>
                  <td style={{ padding: "0.4rem" }}>{t.dual_authorized_by_email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
