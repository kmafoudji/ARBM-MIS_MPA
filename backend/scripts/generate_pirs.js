/**
 * generate_pirs.js — Générateur PIRS DOCX (SF-7, RG-7.3)
 * Usage : node generate_pirs.js <data.json> <output.docx>
 *
 * Couleurs ARBM-MES : Lime #A4C53F · Navy #1B5A8C
 */
const fs   = require("fs");
const path = require("path");

const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, ShadingType,
  WidthType, PageOrientation, Header, Footer, PageNumber,
  NumberFormat, convertInchesToTwip, Packer,
} = require("docx");

// ── Utilitaires ──────────────────────────────────────────────────────────────

const LIME  = "A4C53F";
const NAVY  = "1B5A8C";
const GRAY  = "6B7280";
const LIGHT = "F0F6DC";
const WHITE = "FFFFFF";
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS  = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE };

const RAG_COLORS = { green: "16a34a", amber: "D97706", red: "DC2626", na: "9CA3AF" };
const RAG_LABELS = { green: "On Track", amber: "At Risk", red: "Off Track", na: "No Data" };

function cell(text, opts = {}) {
  const {
    bold = false, color = "111111", bg = null, width = null,
    align = AlignmentType.LEFT, size = 18, span = 1,
  } = opts;
  return new TableCell({
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text || "—"), bold, color, size })],
    })],
    ...(bg ? { shading: { type: ShadingType.CLEAR, fill: bg } } : {}),
    ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
    columnSpan: span,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      left:   { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      right:  { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
    },
  });
}

function headerCell(text, width = null) {
  return cell(text, { bold: true, color: WHITE, bg: NAVY, width, size: 16 });
}

function labelCell(text, width = 2000) {
  return cell(text, { bold: true, color: NAVY, bg: "F8FAFC", width, size: 17 });
}

function section(title) {
  return new Paragraph({
    children: [new TextRun({ text: title.toUpperCase(), bold: true, color: WHITE, size: 20, allCaps: true })],
    shading:  { type: ShadingType.CLEAR, fill: NAVY },
    spacing:  { before: 200, after: 80 },
    indent:   { left: 80 },
  });
}

function subSection(title) {
  return new Paragraph({
    children: [new TextRun({ text: title, bold: true, color: NAVY, size: 18 })],
    shading:  { type: ShadingType.CLEAR, fill: LIGHT },
    spacing:  { before: 120, after: 60 },
    indent:   { left: 80 },
  });
}

function infoTable(rows, colWidths = [2200, 7000]) {
  return new Table({
    width: { size: 9200, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map(([lbl, val]) => new TableRow({
      children: [
        labelCell(lbl, colWidths[0]),
        cell(val, { width: colWidths[1] }),
      ],
    })),
  });
}

// ── Document ─────────────────────────────────────────────────────────────────

async function generatePIRS(data) {
  const { project, indicator, baseline, targets, actuals, disaggregations, generated_at } = data;

  const genDate = new Date(generated_at).toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const children = [];

  // ── Bandeau titre ──────────────────────────────────────────────────────────
  children.push(new Paragraph({
    children: [new TextRun({ text: "PERFORMANCE INDICATOR REFERENCE SHEET", bold: true, color: WHITE, size: 28, allCaps: true })],
    shading:  { type: ShadingType.CLEAR, fill: NAVY },
    alignment: AlignmentType.CENTER,
    spacing:  { before: 0, after: 0 },
    indent:   { left: 80, right: 80 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Lives & Livelihoods Fund 2 · IsDB  ·  Generated ${genDate}`, color: WHITE, size: 16 })],
    shading:  { type: ShadingType.CLEAR, fill: "2B6CB0" },
    alignment: AlignmentType.CENTER,
    spacing:  { before: 0, after: 200 },
    indent:   { left: 80, right: 80 },
  }));

  // ── Section A : Identification ──────────────────────────────────────────────
  children.push(section("A. Project Identification"));
  children.push(infoTable([
    ["Official Reference", project.official_reference_number || "—"],
    ["Project Name",    project.name || "—"],
    ["Sector",          project.sector || "—"],
    ["Hub",             project.hub || "—"],
    ["Country",         project.country || "—"],
    ["Period",          `${project.start_date || "—"} → ${project.end_date || "—"}`],
    ["Stage",           (project.lifecycle_stage || "—").replace(/_/g, " ").toUpperCase()],
  ]));

  // ── Section B : Indicator Definition ──────────────────────────────────────
  children.push(section("B. Indicator Definition"));
  children.push(infoTable([
    ["Indicator Code",       indicator.code],
    ["Full Name",            indicator.name],
    ["Chain Level",          indicator.chain_level_display || indicator.chain_level],
    ["Definition",           indicator.definition || "—"],
    ["Unit of Measure",      indicator.unit],
    ["Type",                 indicator.indicator_type],
    ["Direction",            indicator.direction],
    ["Aggregation Rule",     indicator.aggregation_rule],
    ["Calculation Method",   indicator.calculation_method || "—"],
    ["Numerator",            indicator.numerator || "—"],
    ["Denominator",          indicator.denominator || "—"],
    ["Formula",              indicator.formula || "—"],
  ]));

  // ── Section C : Data Collection ────────────────────────────────────────────
  children.push(section("C. Data Collection"));
  children.push(infoTable([
    ["Data Source",          indicator.data_source || "—"],
    ["Collection Method",    indicator.collection_method || "—"],
    ["Reporting Frequency",  indicator.reporting_frequency || "—"],
    ["Means of Verification",indicator.means_of_verification || "—"],
    ["Responsible Party",    indicator.responsible || "—"],
    ["Assumptions",          indicator.assumptions || "—"],
    ["Limitations",          indicator.limitations || "—"],
  ]));

  // ── Section D : Baseline ──────────────────────────────────────────────────
  children.push(section("D. Baseline"));
  children.push(infoTable([
    ["Baseline Value",  baseline.value ? `${baseline.value} ${indicator.unit}` : "Not set"],
    ["Reference Year",  baseline.year ? String(baseline.year) : "—"],
    ["Source",          baseline.source || "—"],
    ["Frequency",       baseline.measurement_frequency || "—"],
    ["Notes",           baseline.notes || "—"],
  ]));

  // ── Section E : Targets ───────────────────────────────────────────────────
  children.push(section("E. Targets"));
  if (targets.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "No targets defined.", color: GRAY, size: 18, italics: true })],
      spacing: { before: 80, after: 80 },
    }));
  } else {
    children.push(new Table({
      width: { size: 9200, type: WidthType.DXA },
      columnWidths: [2500, 1800, 2000, 2000, 900],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Label", 2500),
            headerCell("Target Value", 1800),
            headerCell("Deadline", 2000),
            headerCell("Status", 2000),
            headerCell("PAD", 900),
          ],
        }),
        ...targets.map(t => new TableRow({
          children: [
            cell(t.label || "—", { width: 2500 }),
            cell(`${t.target_value} ${indicator.unit}`, { width: 1800, bold: true, align: AlignmentType.RIGHT }),
            cell(t.target_date, { width: 2000 }),
            cell(t.status.toUpperCase(), { width: 2000, color: t.status === "approved" ? "16a34a" : "D97706" }),
            cell(t.is_original_pad ? "PAD" : "", { width: 900, bold: true, color: NAVY }),
          ],
        })),
      ],
    }));
  }

  // ── Section F : Results by Period ─────────────────────────────────────────
  children.push(section("F. Results by Reporting Period"));
  if (actuals.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: "No approved data entered.", color: GRAY, size: 18, italics: true })],
      spacing: { before: 80, after: 80 },
    }));
  } else {
    const ragColWidth = 1800;
    const colW = [1800, 1600, 1600, ragColWidth, 2400];
    children.push(new Table({
      width: { size: 9200, type: WidthType.DXA },
      columnWidths: colW,
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Period",       colW[0]),
            headerCell("Actual Value", colW[1]),
            headerCell("Achievement",  colW[2]),
            headerCell("RAG Status",   colW[3]),
            headerCell("Narrative",    colW[4]),
          ],
        }),
        ...actuals.map(a => new TableRow({
          children: [
            cell(a.period_label, { width: colW[0] }),
            cell(`${a.actual_value} ${indicator.unit}`, { width: colW[1], bold: true, align: AlignmentType.RIGHT }),
            cell(a.achievement_rate ? `${a.achievement_rate}%` : "—", { width: colW[2], align: AlignmentType.CENTER }),
            cell(RAG_LABELS[a.rag_status] || "—", { width: colW[3], bold: true, color: RAG_COLORS[a.rag_status] || GRAY }),
            cell(a.narrative || "—", { width: colW[4] }),
          ],
        })),
      ],
    }));
  }

  // ── Section G : Disaggregation ─────────────────────────────────────────────
  if (disaggregations.length > 0) {
    children.push(section("G. Disaggregation"));
    for (const dim of disaggregations) {
      if (!dim.categories.length) continue;
      children.push(subSection(dim.dimension));
      // Construire le tableau croisé périodes × catégories
      const periods_present = dim.categories.map(c => c.period_label);
      const all_cats = [...new Set(dim.categories.flatMap(c => c.values.map(v => v.cat)))];
      const catWidth = Math.floor(8000 / (all_cats.length + 1));
      children.push(new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [1200, ...all_cats.map(() => catWidth)],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("Period", 1200),
              ...all_cats.map(c => headerCell(c, catWidth)),
            ],
          }),
          ...dim.categories.map(period_data => new TableRow({
            children: [
              labelCell(period_data.period_label, 1200),
              ...all_cats.map(cat => {
                const found = period_data.values.find(v => v.cat === cat);
                return cell(found ? `${found.val} ${indicator.unit}` : "—", { width: catWidth, align: AlignmentType.RIGHT });
              }),
            ],
          })),
        ],
      }));
    }
  }

  // ── Section H : Cross-cutting & SDGs ──────────────────────────────────────
  if ((indicator.cross_cutting_tags?.length > 0) || (indicator.related_sdgs?.length > 0)) {
    children.push(section("H. Cross-cutting Themes & SDGs"));
    children.push(infoTable([
      ["Cross-cutting Tags", (indicator.cross_cutting_tags || []).join(", ") || "—"],
      ["Related SDGs",       (indicator.related_sdgs || []).map(n => `SDG ${n}`).join(", ") || "—"],
    ]));
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  children.push(new Paragraph({
    children: [new TextRun({ text: `PIRS · ${indicator.code} · ${project.official_reference_number} · v${indicator.version} · Generated ${genDate} · CONFIDENTIAL`, color: GRAY, size: 14, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing:   { before: 400 },
    border:    { top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" } },
  }));

  // ── Document ──────────────────────────────────────────────────────────────
  const doc = new Document({
    creator:     "ARBM-MES · MillenniumPromise",
    title:       `PIRS · ${indicator.code} · ${project.official_reference_number}`,
    description: `Performance Indicator Reference Sheet — ${indicator.name}`,
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const [,, dataPath, outPath] = process.argv;
  if (!dataPath || !outPath) {
    console.error("Usage: node generate_pirs.js <data.json> <output.docx>");
    process.exit(1);
  }
  const data   = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const buffer = await generatePIRS(data);
  fs.writeFileSync(outPath, buffer);
  console.log("OK:", outPath);
})();
