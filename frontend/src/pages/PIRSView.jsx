/**
 * PIRSView — SF-7 Module 2 (RG-7.1 / RG-7.2 / RG-7.3)
 * Fiche de référence d'indicateur (Performance Indicator Reference Sheet)
 * Données temps réel · Export DOCX
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import { fmtNum, fmtPct } from "../utils.js";

const RAG_CONFIG = {
  green: { color: "#16a34a", bg: "#dcfce7", label: "On Track" },
  amber: { color: "#d97706", bg: "#fef9c3", label: "At Risk" },
  red:   { color: "#dc2626", bg: "#fee2e2", label: "Off Track" },
  na:    { color: "#9ca3af", bg: "#f3f4f6", label: "No Data" },
};

function RagBadge({ rag }) {
  const cfg = RAG_CONFIG[rag] || RAG_CONFIG.na;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "#1B5A8C", color: "#fff",
      padding: "10px 16px", borderRadius: 8, marginBottom: 12, marginTop: 24,
    }}>
      {icon && <Icon name={icon} size={15} />}
      <span style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </span>
    </div>
  );
}

function DlRow({ label, value, mono = false }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #f0f0ee" }}>
      <div style={{
        width: 200, flexShrink: 0, padding: "8px 12px",
        fontSize: 11, fontWeight: 700, color: "#1B5A8C",
        background: "#f8fafc",
      }}>{label}</div>
      <div style={{
        flex: 1, padding: "8px 12px", fontSize: 12, color: "#374151",
        fontFamily: mono ? "monospace" : "inherit",
      }}>{value}</div>
    </div>
  );
}

function InfoBlock({ rows }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
      {rows.filter(r => r[1] || r[1] === 0).map(([label, value, mono], i) => (
        <DlRow key={i} label={label} value={value} mono={mono} />
      ))}
    </div>
  );
}

export default function PIRSView({ projectId, rowId, onBack }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pirs", projectId, rowId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/pirs/`),
    staleTime: 30_000,
  });

  function handleExportDocx() {
    const url = `/api/projects/${projectId}/logframe/${rowId}/pirs/?format=docx`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `PIRS_${data?.project?.code}_${data?.indicator?.code}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (isLoading) return (
    <div className="view">
      <div style={{ padding: 40, textAlign: "center" }}>
        <span className="spinner" /> Loading PIRS data…
      </div>
    </div>
  );

  if (error) return (
    <div className="view">
      <div style={{ color: "#dc2626", padding: 20 }}>
        Error: {JSON.stringify(error?.detail || error?.message)}
      </div>
    </div>
  );

  const { project, indicator, baseline, targets, actuals, disaggregations, generated_at } = data;
  const genDate = new Date(generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="view">

      {/* ── En-tête ──────────────────────────────────────────────────── */}
      <div className="view-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="view-eyebrow">Module 2 · SF-7 · Performance Indicator Reference Sheet</div>
            <h1 className="view-title" style={{ fontSize: 22, margin: "4px 0" }}>
              <span style={{ fontFamily: "monospace", fontSize: 14, color: "#A4C53F", marginRight: 8 }}>
                {indicator.code}
              </span>
              {indicator.name}
            </h1>
            <div className="view-lead" style={{ marginTop: 4 }}>
              {project.name} · {project.code} · Generated {genDate}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={onBack}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={handleExportDocx}>
              <Icon name="download" size={14} /> Export DOCX
            </button>
          </div>
        </div>
      </div>

      {/* ── A. Project ───────────────────────────────────────────────── */}
      <SectionHeader title="A. Project Identification" icon="folder" />
      <InfoBlock rows={[
        ["Project Code",  project.code],
        ["Project Name",  project.name],
        ["Acronym",       project.acronym],
        ["Sector",        project.sector],
        ["Hub",           project.hub],
        ["Country",       project.country],
        ["Period",        project.start_date ? `${project.start_date} → ${project.end_date || "—"}` : null],
        ["Stage",         project.lifecycle_stage?.replace(/_/g, " ").toUpperCase()],
      ]} />

      {/* ── B. Indicator Definition ──────────────────────────────────── */}
      <SectionHeader title="B. Indicator Definition" icon="info-circle" />
      <InfoBlock rows={[
        ["Code",               indicator.code, true],
        ["Full Name",          indicator.name],
        ["Chain Level",        indicator.chain_level_display],
        ["Definition",         indicator.definition],
        ["Unit of Measure",    indicator.unit],
        ["Type",               indicator.indicator_type],
        ["Direction",          indicator.direction],
        ["Aggregation Rule",   indicator.aggregation_rule],
        ["Calculation Method", indicator.calculation_method],
        ["Numerator",          indicator.numerator],
        ["Denominator",        indicator.denominator],
        ["Formula",            indicator.formula, true],
      ]} />

      {/* ── C. Data Collection ───────────────────────────────────────── */}
      <SectionHeader title="C. Data Collection" icon="database" />
      <InfoBlock rows={[
        ["Data Source",          indicator.data_source],
        ["Collection Method",    indicator.collection_method],
        ["Reporting Frequency",  indicator.reporting_frequency],
        ["Means of Verification",indicator.means_of_verification],
        ["Responsible Party",    indicator.responsible],
        ["Assumptions",          indicator.assumptions],
        ["Limitations",          indicator.limitations],
      ]} />

      {/* ── D. Baseline ──────────────────────────────────────────────── */}
      <SectionHeader title="D. Baseline" icon="anchor" />
      <InfoBlock rows={[
        ["Baseline Value", baseline.value ? `${fmtNum(baseline.value)} ${indicator.unit}` : "Not set"],
        ["Reference Year", baseline.year],
        ["Source",         baseline.source],
        ["Frequency",      baseline.measurement_frequency],
        ["Notes",          baseline.notes],
      ]} />

      {/* ── E. Targets ───────────────────────────────────────────────── */}
      <SectionHeader title="E. Targets" icon="target" />
      {targets.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>No targets defined.</p>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1B5A8C" }}>
                {["Label", "Target Value", "Deadline", "Status", "PAD"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", color: "#fff", textAlign: h === "Target Value" ? "right" : "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {targets.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f0f0ee" }}>
                  <td style={{ padding: "8px 12px" }}>{t.label || "—"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>{fmtNum(t.target_value)} <span style={{ color: "#9ca3af", fontWeight: 400 }}>{indicator.unit}</span></td>
                  <td style={{ padding: "8px 12px" }}>{t.target_date}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.status === "approved" ? "#16a34a" : "#d97706" }}>
                      {t.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {t.is_original_pad && <span style={{ fontSize: 11, fontWeight: 700, color: "#1B5A8C" }}>PAD</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── F. Results by Period ─────────────────────────────────────── */}
      <SectionHeader title="F. Results by Reporting Period" icon="bar-chart-2" />
      {actuals.length === 0 ? (
        <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>No approved data entered.</p>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1B5A8C" }}>
                {["Period", "Actual Value", "Achievement", "RAG Status", "Narrative"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", color: "#fff", textAlign: ["Actual Value", "Achievement"].includes(h) ? "right" : "left", fontSize: 11, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actuals.map((a, i) => (
                <tr key={a.period_id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f0f0ee" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>{a.period_label}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>{fmtNum(a.actual_value)} <span style={{ color: "#9ca3af", fontWeight: 400 }}>{indicator.unit}</span></td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{a.achievement_rate ? fmtPct(a.achievement_rate) : "—"}</td>
                  <td style={{ padding: "8px 12px" }}><RagBadge rag={a.rag_status} /></td>
                  <td style={{ padding: "8px 12px", color: "#374151", fontSize: 12 }}>{a.narrative || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── G. Disaggregation ────────────────────────────────────────── */}
      {disaggregations.some(d => d.categories.length > 0) && (
        <>
          <SectionHeader title="G. Disaggregation" icon="layers" />
          {disaggregations.map((dim, di) => {
            if (!dim.categories.length) return null;
            const allCats = [...new Set(dim.categories.flatMap(c => c.values.map(v => v.cat)))];
            return (
              <div key={di} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#1B5A8C", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {dim.dimension}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f0f6dc" }}>
                        <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: 700, color: "#374151", fontSize: 11 }}>Period</th>
                        {allCats.map(c => (
                          <th key={c} style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "#374151", fontSize: 11 }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dim.categories.map((period, pi) => (
                        <tr key={pi} style={{ borderBottom: "1px solid #f0f0ee" }}>
                          <td style={{ padding: "7px 12px", fontWeight: 500 }}>{period.period_label}</td>
                          {allCats.map(cat => {
                            const found = period.values.find(v => v.cat === cat);
                            return (
                              <td key={cat} style={{ padding: "7px 12px", textAlign: "right" }}>
                                {found ? `${fmtNum(found.val)} ${indicator.unit}` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── H. Cross-cutting ─────────────────────────────────────────── */}
      {((indicator.cross_cutting_tags?.length > 0) || (indicator.related_sdgs?.length > 0)) && (
        <>
          <SectionHeader title="H. Cross-cutting Themes & SDGs" icon="globe" />
          <InfoBlock rows={[
            ["Cross-cutting Tags", (indicator.cross_cutting_tags || []).join(", ")],
            ["Related SDGs",       (indicator.related_sdgs || []).map(n => `SDG ${n}`).join(", ")],
            ["Indicator Version",  `v${indicator.version}`],
          ]} />
        </>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
        PIRS · {indicator.code} · {project.code} · v{indicator.version} · Generated {genDate} · ARBM-MES · MillenniumPromise / IsDB LLF2
      </div>
    </div>
  );
}
