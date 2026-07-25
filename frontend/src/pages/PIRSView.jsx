/**
 * PIRSView — SF-7 Module 2 (RG-7.1 / RG-7.2 / RG-7.3)
 * Performance Indicator Reference Sheet — couleurs ARBM-MES
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "../components/Icon";
import { fmtNum, fmtPct } from "../utils.js";

const RAG = {
  green: { color: "#16a34a", bg: "#dcfce7", label: "On Track",  icon: "circle-check" },
  amber: { color: "#d97706", bg: "#fef9c3", label: "At Risk",   icon: "alert-triangle" },
  red:   { color: "#dc2626", bg: "#fee2e2", label: "Off Track", icon: "circle-x" },
  na:    { color: "#9ca3af", bg: "#f3f4f6", label: "No Data",   icon: "minus" },
};

function RagBadge({ rag }) {
  const cfg = RAG[rag] || RAG.na;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
    }}>
      <Icon name={cfg.icon} size={10} />
      {cfg.label}
    </span>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "#111", color: "#fff",
      padding: "9px 14px", borderRadius: 8,
      marginBottom: 10, marginTop: 24,
    }}>
      {icon && <Icon name={icon} size={14} style={{ color: "#A4C53F" }} />}
      <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {title}
      </span>
    </div>
  );
}

function InfoBlock({ rows }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
      {rows.filter(([, v]) => v || v === 0).map(([label, value, mono], i) => (
        <div key={i} style={{ display: "flex", borderBottom: i < rows.length - 1 ? "1px solid #f0f0ee" : "none" }}>
          <div style={{ width: 200, flexShrink: 0, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#374151", background: "#f9fafb" }}>
            {label}
          </div>
          <div style={{ flex: 1, padding: "8px 12px", fontSize: 12, color: "#111", fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.5 }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#111" }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: "9px 12px", color: "#fff", textAlign: typeof h === "object" ? h.align : "left",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                {typeof h === "object" ? h.label : h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#fafaf8", borderBottom: "1px solid #f0f0ee" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "8px 12px",
                  textAlign: typeof headers[ci] === "object" ? headers[ci].align : "left",
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PIRSView({ projectId, rowId, onBack }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pirs", projectId, rowId],
    queryFn:  () => apiFetch(`/api/projects/${projectId}/logframe/${rowId}/pirs/`),
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div className="view"><div style={{ padding: 40, textAlign: "center" }}>
      <span className="spinner" /> Loading PIRS…
    </div></div>
  );

  if (error) return (
    <div className="view"><div style={{ color: "#dc2626", padding: 20 }}>
      Error: {JSON.stringify(error?.detail || error?.message)}
    </div></div>
  );

  const { project, indicator, baseline, targets, actuals, disaggregations, generated_at } = data;
  const genDate = new Date(generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  function handleExportDocx() {
    const url = `/api/projects/${projectId}/logframe/${rowId}/pirs/?format=docx`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `PIRS_${project.code}_${indicator.code}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="view">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="view-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="view-eyebrow">Module 2 · SF-7 · Performance Indicator Reference Sheet</div>
            <h1 className="view-title" style={{ fontSize: 20, margin: "4px 0", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, background: "#f0f6dc", color: "#7a9420", padding: "2px 8px", borderRadius: 6 }}>
                {indicator.code}
              </span>
              {indicator.name}
            </h1>
            <p className="view-lead" style={{ marginTop: 4 }}>
              {project.name} · {project.code} · Generated {genDate}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start", marginTop: 4 }}>
            {project.pad_url && (
              <a href={project.pad_url} target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm row" style={{ gap: 6 }}>
                <Icon name="file-text" size={14} /> PAD
              </a>
            )}
            <button className="btn btn-ghost btn-sm row" style={{ gap: 6 }} onClick={onBack}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
            <button className="btn btn-primary btn-sm row" style={{ gap: 6 }} onClick={handleExportDocx}>
              <Icon name="download" size={14} /> Export DOCX
            </button>
          </div>
        </div>
      </div>

      {/* ── A. Project ──────────────────────────────────────────────── */}
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
        ["PAD Document",  project.pad_name ? (
          <a href={project.pad_url} target="_blank" rel="noreferrer"
            style={{ color: "#A4C53F", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="download" size={12} /> {project.pad_name}
          </a>
        ) : null],
      ]} />

      {/* ── B. Indicator Definition ─────────────────────────────────── */}
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

      {/* ── C. Data Collection ──────────────────────────────────────── */}
      <SectionHeader title="C. Data Collection" icon="database" />
      <InfoBlock rows={[
        ["Data Source",           indicator.data_source],
        ["Collection Method",     indicator.collection_method],
        ["Reporting Frequency",   indicator.reporting_frequency],
        ["Means of Verification", indicator.means_of_verification],
        ["Responsible Party",     indicator.responsible],
        ["Assumptions",           indicator.assumptions],
        ["Limitations",           indicator.limitations],
      ]} />

      {/* ── D. Baseline ─────────────────────────────────────────────── */}
      <SectionHeader title="D. Baseline" icon="anchor" />
      <InfoBlock rows={[
        ["Baseline Value", baseline.value ? `${fmtNum(baseline.value)} ${indicator.unit}` : "Not set"],
        ["Reference Year", baseline.year ? String(baseline.year) : null],
        ["Source",         baseline.source],
        ["Frequency",      baseline.measurement_frequency],
        ["Notes",          baseline.notes],
      ]} />

      {/* ── E. Targets ──────────────────────────────────────────────── */}
      <SectionHeader title="E. Targets" icon="target" />
      {targets.length === 0
        ? <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>No targets defined.</p>
        : <DataTable
            headers={["Label", { label: "Target Value", align: "right" }, "Deadline", "Status", "PAD"]}
            rows={targets.map(t => [
              t.label || "—",
              <span style={{ fontWeight: 700 }}>{fmtNum(t.target_value)} <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 11 }}>{indicator.unit}</span></span>,
              t.target_date,
              <span style={{ fontSize: 11, fontWeight: 700, color: t.status === "approved" ? "#16a34a" : "#d97706" }}>{t.status.toUpperCase()}</span>,
              t.is_original_pad ? <span style={{ fontSize: 11, fontWeight: 700, color: "#A4C53F" }}>✓ PAD</span> : null,
            ])}
          />
      }

      {/* ── F. Results by Period ────────────────────────────────────── */}
      <SectionHeader title="F. Results by Reporting Period" icon="bar-chart-2" />
      {actuals.length === 0
        ? <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>No approved data entered.</p>
        : <DataTable
            headers={[
              "Period",
              { label: "Actual", align: "right" },
              { label: "Target", align: "right" },
              { label: "Achievement", align: "right" },
              "RAG",
              "Narrative",
            ]}
            rows={actuals.map(a => [
              <span style={{ fontWeight: 500 }}>{a.period_label}</span>,
              <span style={{ fontWeight: 700 }}>{fmtNum(a.actual_value)} <span style={{ color: "#9ca3af", fontWeight: 400 }}>{indicator.unit}</span></span>,
              a.target_value ? <span>{fmtNum(a.target_value)} <span style={{ color: "#9ca3af" }}>{indicator.unit}</span></span> : "—",
              a.achievement_rate ? <span style={{ fontWeight: 700, color: RAG[a.rag_status]?.color || "#111" }}>{fmtPct(a.achievement_rate)}</span> : "—",
              <RagBadge rag={a.rag_status} />,
              <span style={{ color: "#374151" }}>{a.narrative || "—"}</span>,
            ])}
          />
      }

      {/* ── G. Disaggregation ───────────────────────────────────────── */}
      {disaggregations.some(d => d.categories.length > 0) && (
        <>
          <SectionHeader title="G. Disaggregation" icon="layers" />
          {disaggregations.map((dim, di) => {
            if (!dim.categories.length) return null;
            const allCats = [...new Set(dim.categories.flatMap(c => c.values.map(v => v.cat)))];
            return (
              <div key={di} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {dim.dimension}
                </div>
                <DataTable
                  headers={["Period", ...allCats.map(c => ({ label: c, align: "right" }))]}
                  rows={dim.categories.map(period_data => [
                    period_data.period_label,
                    ...allCats.map(cat => {
                      const found = period_data.values.find(v => v.cat === cat);
                      return found ? `${fmtNum(found.val)} ${indicator.unit}` : "—";
                    }),
                  ])}
                />
              </div>
            );
          })}
        </>
      )}

      {/* ── H. Cross-cutting ────────────────────────────────────────── */}
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

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
        PIRS · {indicator.code} · {project.code} · v{indicator.version} · {genDate} · ARBM-MES · MillenniumPromise / IsDB LLF2
      </div>
    </div>
  );
}
