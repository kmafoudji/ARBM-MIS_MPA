import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import RefreshBar from "../components/RefreshBar.jsx";
import ProjectTypeFilter, { useProjectType } from "../components/ProjectTypeFilter.jsx";
import { Bar, Card, Donut, Empty } from "../components/Charts.jsx";

/* Tier III — how the Fund itself is performing, as opposed to the projects in
   it. Annex L lists 34 operational indicators in five sections; none of them
   is ever typed in, every one is computed from the shared record.
   Thirteen have a source in the database today. The other twenty-one are
   shown all the same, greyed and carrying the reason they cannot be computed:
   the gaps are the most useful thing on this page, and hiding them would turn
   a map of what the Fund does not yet track into a page that looks complete.

   Three ways in, as in the design mockup:
     A · scorecard      every indicator, one tile each
     B · analytics      the distributions behind the headline figures
     C · executive      five columns, one screen, one question each

   Note what B is not. The mockup's analytics view is largely quarter-on-quarter
   lines, and this system snapshots none of these figures — so every chart here
   is cross-sectional, a cut of the present. Drawing a trend would mean
   inventing the past. */

/* Palette token per section, sent by the backend (docs/design.md). */
const SECTION_COLOR = {
  green:  "var(--green)",
  blue:   "var(--blue)",
  orange: "var(--orange)",
  rose:   "var(--rose)",
  violet: "var(--violet)",
};

const VIEWS = [
  { key: "a", letter: "A", name: "Scorecard",     hint: "every indicator, one tile" },
  { key: "b", letter: "B", name: "Analytics",     hint: "the splits behind the figures" },
  { key: "c", letter: "C", name: "Executive page", hint: "five columns, one screen" },
];

/* Long figures stay readable: 2 310 000 000 is a wall, 2.31 bn is a number. */
function fmtValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") return String(value);
  return value >= 1000 ? value.toLocaleString() : String(value);
}

function fmtUsd(value) {
  if (!value) return "0";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} bn`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  return value.toLocaleString();
}

function byCode(sections) {
  const found = {};
  sections.forEach((s) => s.indicators.forEach((i) => { found[i.code] = i; }));
  return found;
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

/* A figure and its label, or a dash when the indicator has no source. */
function Kv({ indicator, label }) {
  const off = !indicator?.available || indicator?.value == null;
  return (
    <div className={`fund-kv-cell${off ? " off" : ""}`}>
      <b>{off ? "—" : `${fmtValue(indicator.value)}${indicator.unit || ""}`}</b>
      <span>{label}</span>
    </div>
  );
}

/* ── A · scorecard ──────────────────────────────────────────────────────── */

function Tile({ indicator, color }) {
  const { code, name, available, value, unit, note, reason } = indicator;
  const shown = fmtValue(value);

  if (!available) {
    return (
      <div className="fund-tile off">
        <span className="fund-tile-code">{code}</span>
        <div className="fund-tile-name">{name}</div>
        <div className="fund-tile-untracked">Not tracked</div>
        <div className="fund-tile-reason">{reason}</div>
      </div>
    );
  }

  return (
    <div className="fund-tile" style={{ "--tile-color": color }}>
      <span className="fund-tile-code">{code}</span>
      <div className="fund-tile-name">{name}</div>
      {shown === null ? (
        // Computable, but nothing recorded yet. A dash, never a zero.
        <div className="fund-tile-pending" title="Nothing recorded yet">—</div>
      ) : (
        <div className="fund-tile-value">
          {shown}
          {unit && <span className="unit">{unit}</span>}
        </div>
      )}
      {note && <div className="fund-tile-note">{note}</div>}
    </div>
  );
}

function ScorecardView({ sections }) {
  return sections.map((section) => {
    const color = SECTION_COLOR[section.color] || "var(--ink)";
    const available = section.indicators.filter((i) => i.available).length;
    return (
      <div key={section.key} className="cat-section">
        <div className="section-bar" style={{ background: color }}>
          <span>{section.number} · {section.name}</span>
          <span className="count">{available} of {section.indicators.length} computed</span>
        </div>
        <div className="fund-tiles">
          {section.indicators.map((indicator) => (
            <Tile key={indicator.code} indicator={indicator} color={color} />
          ))}
        </div>
      </div>
    );
  });
}

/* ── B · analytics ──────────────────────────────────────────────────────── */

function SectionBand({ section, note }) {
  return (
    <div className="section-bar" style={{ background: SECTION_COLOR[section.color] }}>
      <span>{section.number} · {section.name}</span>
      {note && <span className="count">{note}</span>}
    </div>
  );
}

function AnalyticsView({ sections, breakdowns }) {
  const found = byCode(sections);
  const bySection = Object.fromEntries(sections.map((s) => [s.key, s]));
  const { quality, sdg, finance, pipeline, comms } = bySection;
  const {
    projects_by_sector: bySector,
    financing_by_sector: financeBySector,
    financing_by_instrument: byInstrument,
    financing_by_source: bySource,
    sdg_coverage: sdgs,
    lifecycle_phases: phases,
  } = breakdowns;

  /* Section 1 — the three quality measures that exist, on one scale (all are
     percentages), so they can be compared at a glance. */
  const qualityBars = ["1.1", "1.5", "1.8"].map((code) => found[code]).filter(Boolean);

  /* Section 4 — the funnel. The total spans the others, so it is scaled apart. */
  const stepMax = Math.max(
    ...phases.filter((p) => !p.is_total && p.months != null).map((p) => p.months),
    1,
  );

  return (
    <>
      {/* 1 */}
      <div className="cat-section">
        <SectionBand section={quality} note="cross-sectional · no history is kept" />
        <div className="fund-grid two">
          <Card title="Quality measures that exist" sub="the three of nine with a source, on one scale">
            {qualityBars.length === 0 ? (
              <Empty>Nothing computable yet.</Empty>
            ) : (
              <div className="fund-bars">
                {qualityBars.map((i) => (
                  <Bar
                    key={i.code}
                    label={`${i.code} ${i.name}`}
                    value={i.value}
                    display={i.value == null ? "—" : fmtValue(i.value)}
                    max={100}
                    suffix={i.value == null ? "" : "%"}
                    color={SECTION_COLOR.green}
                  />
                ))}
              </div>
            )}
            <div className="notice notice-warn" style={{ marginTop: 12, marginBottom: 0 }}>
              Six of the nine quality indicators have no source: no TRC scoresheet,
              no PPIF record, no PCR, no baseline capture date, no gender-analysis
              flag, and a climate marker with one placeholder value.
            </div>
          </Card>
          <Card title="Where the six gaps are" sub="1.2 · 1.3 · 1.4 · 1.6 · 1.7 · 1.11">
            <div className="fund-bars">
              {quality.indicators.filter((i) => !i.available).map((i) => (
                <Bar key={i.code} label={`${i.code} ${i.name}`} value={null} display="—" max={100} className="off" />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* 2 */}
      <div className="cat-section">
        <SectionBand section={sdg} />
        <div className="fund-grid two">
          <Card title="Projects by sector" sub="the taxonomy stops at sector — there is no sub-sector level">
            {bySector.length === 0 ? (
              <Empty>No project carries a sector.</Empty>
            ) : (
              <div className="fund-bars">
                {bySector.map((row) => (
                  <Bar
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    display={String(row.value)}
                    max={Math.max(...bySector.map((r) => r.value))}
                    color={SECTION_COLOR.blue}
                  />
                ))}
              </div>
            )}
          </Card>
          <Card title="SDG coverage" sub="goals carried by at least one project, in their own UN colours">
            {sdgs.length === 0 ? (
              <Empty>No project carries an SDG.</Empty>
            ) : (
              <>
                <div className="fund-sdgs">
                  {sdgs.map((s) => (
                    <span
                      key={s.number}
                      className="fund-sdg"
                      style={{ background: s.color || "var(--ink-soft)" }}
                      title={s.name}
                    >
                      {s.label} <b>{s.value}</b>
                    </span>
                  ))}
                </div>
                <div className="fund-kv" style={{ marginTop: 12 }}>
                  <Kv indicator={found["2.2"]} label="indicators SDG-aligned" />
                  <Kv indicator={found["2.4"]} label="beneficiaries reached" />
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* 3 */}
      <div className="cat-section">
        <SectionBand section={finance} note="commitments — no disbursement is recorded" />
        <div className="fund-grid wide-left">
          <Card title="Financing by instrument and by source" sub="3.4 · 3.7 · 3.10 · share of the total envelope">
            <div className="fund-grid two">
              <Donut rows={byInstrument} color={SECTION_COLOR.orange} format={fmtUsd} />
              <Donut rows={bySource} color={SECTION_COLOR.orange} format={fmtUsd} />
            </div>
          </Card>
          <Card title="Headline ratios" sub="3.1 · 3.4 · 3.7 · 3.10">
            <div className="fund-kv">
              <Kv indicator={found["3.1"]} label="portfolio size" />
              <Kv indicator={found["3.4"]} label="grant share" />
              <Kv indicator={found["3.7"]} label="leverage grant : OCR" />
              <Kv indicator={found["3.10"]} label="co-financing ratio" />
              <Kv indicator={found["3.9"]} label="disbursement rate" />
              <Kv indicator={found["3.6"]} label="grant utilisation" />
            </div>
          </Card>
        </div>
        <div style={{ marginTop: 12 }}>
          <Card title="Financing by sector" sub="3.2 · USD and share of the total">
            {financeBySector.length === 0 ? (
              <Empty>No financing line carries a sector.</Empty>
            ) : (
              <div className="fund-bars">
                {financeBySector.map((row) => (
                  <Bar
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    display={fmtUsd(row.value)}
                    max={Math.max(...financeBySector.map((r) => r.value))}
                    suffix={` · ${row.share}%`}
                    color={SECTION_COLOR.orange}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 4 */}
      <div className="cat-section">
        <SectionBand section={pipeline} />
        <Card title="Where the time goes — average months per phase" sub="4.1 → 4.5 · the start-up phases are the ones the Fund controls">
          <div className="fund-bars">
            {phases.map((p) => (
              <Bar
                key={p.code}
                label={`${p.code} ${p.label}`}
                value={p.available ? p.months : null}
                display={p.months == null ? "—" : String(p.months)}
                max={p.is_total ? Math.max(p.months || 1, 1) : stepMax}
                suffix={p.months == null ? "" : " mo"}
                color={p.is_total ? "var(--ink)" : SECTION_COLOR.rose}
                className={`${p.available ? "" : "off"}${p.is_total ? " total" : ""}`}
              />
            ))}
          </div>
          <div className="notice notice-warn" style={{ marginTop: 12, marginBottom: 0 }}>
            Two of the five steps cannot be measured — both are anchored on a first
            disbursement, which this system does not record. The steps that can be
            measured rest on the lifecycle transitions actually entered:{" "}
            {phases.filter((p) => p.available && p.months != null).length === 0
              ? "no project has recorded two dated transitions yet, so the funnel is empty."
              : `${Math.max(...phases.map((p) => p.projects))} project(s) so far.`}
          </div>
        </Card>
      </div>

      {/* 5 */}
      <div className="cat-section">
        <SectionBand section={comms} note="0 of 6 computed" />
        <Card title="Communications" sub="5.1 – 5.6">
          <Empty>
            Nothing in this section has a source. Communications activity — assets,
            stories, media coverage, social mentions, events, dashboard views — is
            not recorded anywhere in the system. Tracking it is a decision about
            process, not only about tables: it means someone enters these figures
            every quarter.
          </Empty>
        </Card>
      </div>
    </>
  );
}

/* ── C · executive page ─────────────────────────────────────────────────── */

/* One column per section: a ring for the headline indicator, then the rest as
   one line each. `hero` names the indicator that answers the section's
   question; `ringMax` scales the ring when the value is not a percentage.
   Keyed by section, not by position — the payload's order is the backend's to
   change. */
const EXEC = {
  quality: { hero: "1.1", ringMax: 100, unit: "meet targets", minis: ["1.5", "1.8", "1.2", "1.4", "1.11"],
    foot: "Six of nine indicators have no source." },
  sdg: { hero: "2.2", ringMax: 100, unit: "SDG-aligned", minis: ["2.1", "2.3", "2.4"],
    foot: "Beneficiary reach is not recorded." },
  finance: { hero: "3.4", ringMax: 100, unit: "grant share", minis: ["3.1", "3.7", "3.10", "3.9", "3.8"],
    foot: "Commitments only — no disbursement data." },
  pipeline: { hero: "4.2", ringMax: null, unit: "months", minis: ["4.1", "4.5", "4.3", "4.4"],
    foot: "Start-up phases are the ones the Fund controls." },
  comms: { hero: null, ringMax: null, unit: "", minis: ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"],
    foot: "Nothing here is recorded by the system." },
};

function Ring({ indicator, max, unit, color }) {
  const value = indicator?.available ? indicator.value : null;
  // With no max the value is not a proportion (months, a ratio): the ring is
  // drawn full rather than faking a share of something.
  const pct = value == null ? 0 : max ? Math.min(100, (value / max) * 100) : 100;
  const track = value == null ? "var(--rule)" : `${color} 0 ${pct}%, var(--surface-2) ${pct}% 100%`;

  return (
    <div className="fund-ring" style={{ background: value == null ? "var(--surface-2)" : `conic-gradient(${track})` }}>
      <div className="fund-ring-inner">
        <b>{value == null ? "—" : fmtValue(value)}</b>
        <span>{unit}</span>
      </div>
    </div>
  );
}

function ExecutiveView({ sections }) {
  const found = byCode(sections);

  return (
    <>
      <div className="fund-exec">
        {sections.map((section) => {
          const spec = EXEC[section.key];
          if (!spec) return null;
          const color = SECTION_COLOR[section.color];
          const hero = spec.hero ? found[spec.hero] : null;
          const available = section.indicators.filter((i) => i.available).length;

          return (
            <div key={section.key} className="fund-col">
              <div className="fund-col-head" style={{ background: color }}>
                <b>{section.number} · {section.name}</b>
                <span>{available} of {section.indicators.length} computed</span>
              </div>

              {hero ? (
                <div className="fund-col-hero">
                  <Ring indicator={hero} max={spec.ringMax} unit={spec.unit} color={color} />
                  <div className="hl">{hero.code} · {hero.name}</div>
                </div>
              ) : (
                <div className="fund-col-hero">
                  <Empty>No indicator in this section has a source.</Empty>
                </div>
              )}

              {spec.minis.map((code) => {
                const i = found[code];
                if (!i) return null;
                const off = !i.available || i.value == null;
                return (
                  <div key={code} className={`fund-mini${off ? " off" : ""}`}>
                    <span className="code">{code}</span>
                    <span className="l">{i.name}</span>
                    <b>{off ? "—" : `${fmtValue(i.value)}${i.unit || ""}`}</b>
                  </div>
                );
              })}

              <div className="fund-col-foot">{spec.foot}</div>
            </div>
          );
        })}
      </div>

      <div className="fund-banner">
        <b>Read left to right:</b> are projects sound → who are we reaching → is the
        money moving → how fast does the machine run → are we telling the story.
        One screen, five questions, thirty-four indicators — and the dashes are as
        much of the answer as the figures.
      </div>
    </>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function FundPerformance() {
  const [view, setView] = useState("a");
  // One project type at a time (ADR 0014): the sector breakdowns speak its taxonomy.
  const [projectType, setProjectType] = useProjectType();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["fund-performance", projectType],
    queryFn: () => apiFetch(`/api/results/fund-performance/?type=${projectType}`),
    staleTime: 60_000,
  });

  const summary = data?.summary;
  const untracked = summary ? summary.indicators_total - summary.indicators_available : 0;

  return (
    <div className="view">
      <div className="view-header">
        <div className="row-between" style={{ alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="view-eyebrow">Annex L · Tier III · Operational indicators</div>
            <h1 className="view-title">Fund performance</h1>
            <p className="view-lead">
              How the Fund itself is performing — quality, reach, money, speed and voice.
              Every figure is computed from the shared record; nothing on this page is typed in.
            </p>
          </div>
          <div className="fund-views">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                className={`fund-view-opt${view === v.key ? " on" : ""}`}
                onClick={() => setView(v.key)}
                aria-pressed={view === v.key}
              >
                <span className="k">{v.letter}</span>
                <span>
                  <b>{v.name}</b>
                  <span className="d">{v.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <RefreshBar dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={refetch} />
        </div>
      </div>

      <div className="exec-filterbar" style={{ marginBottom: 14 }}>
        <ProjectTypeFilter value={projectType} onChange={setProjectType} />
      </div>

      {isLoading && <div className="spinner" />}
      {error && <div className="notice notice-warn">{error.detail || "Could not load fund performance."}</div>}

      {data && (
        <>
          <div className="fund-coverage">
            <div className="fund-coverage-figure">
              <b style={{ color: "var(--green)" }}>{summary.indicators_available}</b>
              <span>computed<br />from the record</span>
            </div>
            <div className="fund-coverage-figure">
              <b style={{ color: "var(--subtle)" }}>{untracked}</b>
              <span>not tracked<br />by the system</span>
            </div>
            <div className="fund-coverage-figure">
              <b>{summary.projects_in_scope}</b>
              <span>projects<br />in scope</span>
            </div>
            <div className="fund-coverage-note">
              No target is shown: Annex L marks every Tier III baseline and target
              <b> TBD</b>, so there is nothing to score a value against and no RAG
              colour to give it. Figures are computed live — no history of them is
              kept, so there is no trend either.
            </div>
          </div>

          {view === "a" && <ScorecardView sections={data.sections} />}
          {view === "b" && <AnalyticsView sections={data.sections} breakdowns={data.breakdowns} />}
          {view === "c" && <ExecutiveView sections={data.sections} />}
        </>
      )}
    </div>
  );
}
