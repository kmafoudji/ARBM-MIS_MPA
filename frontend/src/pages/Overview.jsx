import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Flag from "../components/Flag.jsx";
import Select from "../components/Select.jsx";
import ProjectTypeFilter, { useProjectType } from "../components/ProjectTypeFilter.jsx";
import { typeSectorFilterOptions } from "../utils.js";
import RefreshBar from "../components/RefreshBar.jsx";
import { Bar, Card, Donut, Empty, StackedBar } from "../components/Charts.jsx";
import { deliveryBand } from "../components/ProjectCockpit.jsx";

/* Executive dashboard — the portfolio overview as the committee reads it.

   The deck presents the same record three ways and the page keeps that order:
     Distribution          where the money sits: year, sector, source, size
     Status                what is running, how fast, and what needs a word
     Pipeline & approvals  the seven milestones, and what is waiting on whom

   Every figure comes from one endpoint, /api/projects/executive-summary/,
   computed live inside the user's scope, the hub chosen in the topbar and the
   fund chosen below the title.

   The deck draws a good deal the system does not record — disbursement,
   regions, grant-eligibility tiers, expected board-approval dates, the change
   since the previous committee. Those panels are kept and say "Not tracked"
   with the reason, as on the Tier III page: a dashboard that shows 0% where it
   means "we do not record this" is worse than one that says so. */

const TABS = [
  { key: "distribution", label: "Distribution", hint: "where the money sits" },
  { key: "status",       label: "Status",       hint: "what is running, and how fast" },
  { key: "pipeline",     label: "Pipeline & approvals", hint: "the seven milestones" },
];

// The LLF cycles, offered under the LLF type only (ADR 0014): IsDB has one.
const CYCLE_FILTERS = [
  { value: "",     label: "All" },
  { value: "LLF1", label: "LLF1" },
  { value: "LLF2", label: "LLF2" },
  { value: "none", label: "No cycle" },
];

/* Lifecycle phases, as the former dashboard coloured them (decisions/0012:
   no gate colour — board approval is a pre-approval stage like any other). */
const PHASE_COLOR = {
  pre_approval:   "var(--subtle)",
  implementation: "var(--lime)",
  closure:        "var(--violet)",
  exception:      "var(--rose)",
};

/* The deck's milestones take their colour from the phase they sit in, so the
   strip and the lifecycle columns read as one picture. */
const MILESTONE_PHASE = {
  m0: "pre_approval", m1: "pre_approval", m2: "pre_approval", m3: "pre_approval",
  m4: "implementation", m5: "implementation", m6: "implementation",
  m7: "closure", exception: "exception",
};

/* The same phases as solid fills carrying white text: the accent green only
   reaches contrast in its darker step (docs/design.md). */
const PHASE_FILL = { ...PHASE_COLOR, implementation: "var(--lime-darker)", pre_approval: "var(--ink-soft)" };

const CYCLE_COLOR = { LLF1: "var(--ink)", LLF2: "var(--lime)", IsDB: "var(--blue)", none: "var(--subtle)" };

const SOURCE_COLORS = ["var(--violet)", "var(--blue)", "var(--ink-soft)", "var(--orange)", "var(--subtle)"];

const RESULT_BANDS = [
  { key: "on_track",  label: "On track",          color: "var(--green)" },
  { key: "at_risk",   label: "At risk",           color: "var(--orange)" },
  { key: "off_track", label: "Off track",         color: "var(--rose)" },
  { key: "no_data",   label: "No approved value", color: "var(--rule)" },
];

function fmtUsd(value) {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} bn`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} K`;
  return value.toLocaleString();
}

function fmtPct(value) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

function Kpi({ label, value, sub, meter, meterColor = "var(--lime)" }) {
  return (
    <div className="kpi ov-tile">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value ov-tile-value">{value}</div>
      {sub && <div className="kpi-extra">{sub}</div>}
      {meter != null && (
        <div className="ov-meter"><div className="ov-meter-fill" style={{ width: `${meter}%`, background: meterColor }} /></div>
      )}
    </div>
  );
}

function UntrackedKpi({ label, reason }) {
  return (
    <div className="kpi ov-tile off">
      <div className="kpi-label">{label}</div>
      <div className="ov-untracked">Not tracked</div>
      <div className="ov-reason">{reason}</div>
    </div>
  );
}

/* A card the deck draws and the record cannot fill. */
function UntrackedCard({ title, sub, reason }) {
  return (
    <div className="card exec-untracked">
      <div className="card-header">
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      <div className="card-body">
        <div className="ov-untracked">Not tracked</div>
        <div className="ov-reason">{reason}</div>
      </div>
    </div>
  );
}

/* One of the deck's dark stat boxes. `reason` turns it into a declared gap. */
function Callout({ label, value, sub, reason }) {
  return (
    <div className={`exec-co${reason ? " off" : ""}`}>
      <div className="exec-co-label">{label}</div>
      <div className="exec-co-value">{reason ? "Not tracked" : value}</div>
      <div className="exec-co-sub">{reason || sub}</div>
    </div>
  );
}

/* Vertical columns, one per lifecycle bucket. `count` reads the height; with
   `stacked` each column splits by investment cycle. */
function StageColumns({ buckets, count = (b) => b.count, stacked = false }) {
  const max = Math.max(1, ...buckets.map(count));
  return (
    <>
      <div className="exec-stages">
        {buckets.map((b) => {
          const n = count(b);
          const height = n ? Math.max(8, (n / max) * 100) : 0;
          return (
            <div key={b.key} className="exec-stage" title={b.stages.map((s) => s.label).join(" · ")}>
              <span className="exec-stage-n">{n || "—"}</span>
              <div className={`exec-stage-bar${n ? "" : " zero"}`} style={{ height: n ? `${height}%` : undefined }}>
                {stacked && n
                  ? Object.keys(b.by_cycle).map((cycle) => b.by_cycle[cycle] ? (
                      <span key={cycle} style={{ flex: b.by_cycle[cycle], background: CYCLE_COLOR[cycle] }} />
                    ) : null)
                  : n ? <span style={{ flex: 1, background: PHASE_COLOR[b.phase] }} /> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="exec-stage-labels">
        {buckets.map((b) => <span key={b.key}>{b.label}</span>)}
      </div>
    </>
  );
}

function Legend({ items }) {
  return (
    <div className="ov-legend" style={{ marginTop: 10, marginBottom: 0 }}>
      {items.map((i) => (
        <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

function Footnote({ children }) {
  return <p className="exec-src">{children}</p>;
}

/* ── 1 · distribution ───────────────────────────────────────────────────── */

function DistributionTab({ data, onProjectClick }) {
  const { headline: h, breakdowns: b } = data;
  const maxOf = (rows) => Math.max(1, ...rows.map((r) => r.value || 0));
  const years = b.by_pipeline_year;
  const funded = h.projects - h.projects_without_financing;

  return (
    <>
      <div className="grid grid-4 exec-row">
        <Card title="By pipeline year" sub="US$ · year of IC endorsement">
          {years.unavailable ? <Empty>{years.unavailable}</Empty> : (
            <Donut rows={years.rows} colors={["var(--lime)", "var(--blue)", "var(--violet)", "var(--orange)", "var(--rose)", "var(--ink-soft)"]} format={fmtUsd} />
          )}
          {years.projects_without_year > 0 && (
            <div className="ov-reason">{years.projects_without_year} project(s) have no dated endorsement.</div>
          )}
        </Card>
        <Card title="By sector" sub="US$ · primary sector">
          <Donut rows={b.by_sector} colors={["var(--lime)"]} format={fmtUsd} />
        </Card>
        <UntrackedCard title="By region" sub="US$ · region of the lead country" reason={b.by_region.unavailable} />
        <UntrackedCard title="By grant eligibility" sub="US$ · concessionality tier" reason={b.by_grant_tier.unavailable} />
      </div>

      <div className="fund-grid wide-left exec-row">
        <Card title="Financing mix" sub="US$ · commitments by source, then by instrument">
          <div className="fund-bars">
            <StackedBar
              label="By source"
              segments={b.by_source.map((r, i) => ({ label: r.label, value: r.value, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))}
              format={fmtUsd}
            />
            <StackedBar
              label="By instrument"
              segments={b.by_instrument.map((r, i) => ({ label: r.label, value: r.value, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))}
              format={fmtUsd}
            />
          </div>
          <Legend items={b.by_source.map((r, i) => ({ label: `${r.label} · ${fmtUsd(r.value)}`, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))} />
          <div className="ov-reason">
            Grant resources {fmtUsd(h.grant_usd)}
            {h.grant_share_pct == null ? "" : ` · ${h.grant_share_pct}% of commitments`}
            {h.ocr_per_grant ? ` · IsDB ordinary capital raises ${h.ocr_per_grant}× the grant` : ""}.
          </div>
        </Card>
        <Card title="Average project" sub="size and count, per fund">
          <div className="fund-kv">
            {h.projects_by_cycle.map((c) => (
              <div key={c.label} className={`fund-kv-cell${c.value == null ? " off" : ""}`}>
                <b>{c.value == null || !c.count ? "—" : `≈ ${fmtUsd(c.value / c.count)}`}</b>
                <span>{c.label} · {c.count} project{c.count === 1 ? "" : "s"}</span>
              </div>
            ))}
            <div className="fund-kv-cell">
              <b>{funded > 0 ? `≈ ${fmtUsd(h.portfolio_usd / funded)}` : "—"}</b>
              <span>All funds · {funded} with financing</span>
            </div>
            <div className="fund-kv-cell">
              <b>{h.countries}</b>
              <span>countries · {h.hubs} hub{h.hubs === 1 ? "" : "s"}</span>
            </div>
          </div>
          {h.projects_without_financing > 0 && (
            <div className="ov-reason">
              {h.projects_without_financing} project{h.projects_without_financing === 1 ? " carries" : "s carry"} no
              financing line: counted as projects, left out of every average rather than shown as zero.
            </div>
          )}
        </Card>
      </div>

      <div className="fund-grid wide-left exec-row">
        <Card title="Commitments by project" sub="US$ · click a project to open it">
          {b.by_project.length === 0 ? <Empty>No project carries a financing line.</Empty> : (
            <div className="fund-bars">
              {b.by_project.map((r) => (
                <div key={r.id} role="button" tabIndex={0} className="exec-bar-link" title={r.name}
                  onClick={() => onProjectClick?.(r.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") onProjectClick?.(r.id); }}>
                  <Bar label={<><span className="exec-code">{r.code}</span> {r.cycle || ""}</>} value={r.value}
                    display={fmtUsd(r.value)} max={maxOf(b.by_project)}
                    color={r.cycle === "LLF1" ? "var(--ink)" : r.cycle === "IsDB" ? "var(--blue)" : "var(--lime-darker)"} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="grid" style={{ gap: 12, alignContent: "start" }}>
          <Card title="Commitments by hub" sub="US$ · the project's hub, else its lead country's">
            <div className="fund-bars">
              {b.by_hub.map((r) => (
                <Bar key={r.label} label={`${r.label} · ${r.count}`} value={r.value} display={fmtUsd(r.value)}
                  max={maxOf(b.by_hub)} suffix={r.share == null ? "" : ` · ${r.share}%`}
                  color="var(--blue)" untracked="no financing recorded" />
              ))}
            </div>
          </Card>
          <Card title="Budget by type of work" sub="US$ · indicative component allocations">
            {b.by_work_type.length === 0
              ? <Empty>No component allocation has been recorded.</Empty>
              : <Donut rows={b.by_work_type} color="var(--lime)" format={fmtUsd} />}
          </Card>
        </div>
      </div>

      <Footnote>
        Amounts are commitments as recorded on each financing line, never a disbursement. The deck's regional and
        concessionality splits need fields the schema does not carry; its contract and procurement panels need a
        procurement module — {b.contracts.unavailable.toLowerCase()}
      </Footnote>
    </>
  );
}

/* ── 2 · status ─────────────────────────────────────────────────────────── */

const ATTENTION = {
  overdue_reporting: { icon: "⏰", tone: "rose",   title: (i) => `${i.count} overdue reporting period${i.count === 1 ? "" : "s"}`, sub: (i) => i.count ? `${i.projects} project${i.projects === 1 ? "" : "s"}${i.detail ? ` · ${i.detail}` : ""}` : "none" },
  awaiting_review:   { icon: "✓",  tone: "green",  title: (i) => `${i.count} result${i.count === 1 ? "" : "s"} awaiting review`, sub: (i) => i.count ? `${i.projects} project${i.projects === 1 ? "" : "s"}${i.detail ? ` · ${i.detail}` : ""}` : "none" },
  escalations:       { icon: "⚑",  tone: "orange", title: (i) => `${i.count} active schedule escalation${i.count === 1 ? "" : "s"}`, sub: (i) => i.count ? `across ${i.projects} project${i.projects === 1 ? "" : "s"}` : "none" },
  suspended:         { icon: "⏸",  tone: "orange", title: (i) => `${i.count} suspended project${i.count === 1 ? "" : "s"}`, sub: (i) => i.detail || "none" },
  country_suspensions: { icon: "◇", tone: "off",   title: () => "Country suspensions", sub: (i) => i.unavailable },
};

function Verdict({ execution, watchlist }) {
  const band = deliveryBand(execution.physical_pct, execution.time_elapsed_pct);
  if (!band) {
    return (
      <div className="ov-narrative">
        <p className="ov-narrative-title">Delivery against the clock cannot be read</p>
        <p className="ov-narrative-text">{execution.time_unavailable || execution.physical_unavailable}</p>
      </div>
    );
  }
  const behind = Math.round(-band.gap);
  const worst = watchlist.find((w) => w.gap_pct != null);
  return (
    <div className="ov-narrative" style={{ borderLeftColor: band.token }}>
      <p className="ov-narrative-title">
        {behind > 0 ? `Portfolio is ${behind} points behind the clock` : "Portfolio is on the clock"}
      </p>
      <p className="ov-narrative-text">
        {worst && worst.gap_pct > 0 && <>Widest gap: {worst.code}, {Math.round(worst.time_elapsed_pct)}% of its time gone and {Math.round(worst.physical_pct)}% delivered. </>}
        Physical progress rests on {execution.physical_projects} of {execution.active_projects} active
        projects and is a simple average of activity progress.
      </p>
      <p className="ov-narrative-text ov-narrative-caveat">Financial execution is not part of this reading: no disbursement is recorded.</p>
    </div>
  );
}

function StatusTab({ data, onProjectClick }) {
  const { headline: h, breakdowns: b, lifecycle, execution: x, results, attention, watchlist } = data;
  const implementing = lifecycle
    .filter((bk) => bk.phase === "implementation")
    .reduce((sum, bk) => sum + bk.count, 0);
  const closed = lifecycle.filter((bk) => bk.phase === "closure").reduce((sum, bk) => sum + bk.count, 0);
  const funded = h.projects - h.projects_without_financing;

  return (
    <>
      <div className="exec-callouts exec-row">
        <Callout
          label="Portfolio"
          value={`${h.projects} project${h.projects === 1 ? "" : "s"} in ${h.countries} countr${h.countries === 1 ? "y" : "ies"}`}
          sub={`${implementing} past effectiveness · ${closed} completing or closed`}
        />
        <Callout
          label="Average size"
          value={funded > 0 ? `≈ US$ ${fmtUsd(h.portfolio_usd / funded)} per project` : "—"}
          sub={`US$ ${fmtUsd(h.portfolio_usd)} across ${funded} project${funded === 1 ? "" : "s"} with financing`}
        />
        <Callout label="Disbursement" reason={h.disbursed_unavailable} />
      </div>

      <div className="ov-exec exec-row">
        {x.time_elapsed_pct == null
          ? <UntrackedKpi label="Time elapsed" reason={x.time_unavailable} />
          : <Kpi label="Time elapsed" value={fmtPct(x.time_elapsed_pct)} sub={`of implementation periods · ${x.time_projects} active project${x.time_projects === 1 ? "" : "s"}`} meter={x.time_elapsed_pct} meterColor="var(--muted)" />}
        <UntrackedKpi label="Financial · disbursed" reason={x.financial_unavailable} />
        {x.physical_pct == null
          ? <UntrackedKpi label="Physical progress" reason={x.physical_unavailable} />
          : <Kpi label="Physical progress" value={fmtPct(x.physical_pct)} sub={`${x.physical_projects} of ${x.active_projects} with a workplan · simple average`} meter={x.physical_pct} meterColor="var(--green)" />}
        <Verdict execution={x} watchlist={watchlist} />
      </div>

      <div className="fund-grid wide-left exec-row">
        <Card title="Project status" sub={`${h.projects} projects by lifecycle stage, split by fund`}>
          <StageColumns buckets={lifecycle} stacked />
          <Legend items={h.projects_by_cycle
            .filter((c) => c.key || c.count)
            .map((c) => ({ label: `${c.label} · ${c.count}`, color: CYCLE_COLOR[c.key || "none"] }))} />
        </Card>
        <UntrackedCard
          title="Disbursement by pipeline year and sector"
          sub="disbursed vs remaining · US$"
          reason={b.disbursement.unavailable}
        />
      </div>

      <div className="exec-split exec-row">
        <Card title="Results status" sub="latest approved value of each logframe indicator">
          {results.unavailable ? <Empty>{results.unavailable}</Empty> : (
            <>
              <div className="ov-seg">
                {RESULT_BANDS.map((band) => results[band.key] ? (
                  <span key={band.key} style={{ flex: results[band.key], background: band.color }} />
                ) : null)}
              </div>
              <div className="ov-legend">
                {RESULT_BANDS.map((band) => (
                  <span key={band.key}><i style={{ background: band.color }} />{band.label} {results[band.key]}</span>
                ))}
              </div>
              <div className="ov-list">
                <div className="ov-list-label">By {results.group_level}</div>
                {results.by_group.map((p) => {
                  const total = RESULT_BANDS.reduce((s, band) => s + p[band.key], 0);
                  return (
                    <div key={p.label} className="exec-pillar">
                      <span className="exec-pillar-label">{p.label} · {total}</span>
                      <div className="ov-seg" style={{ marginBottom: 0, flex: 1 }}>
                        {RESULT_BANDS.map((band) => p[band.key] ? (
                          <span key={band.key} style={{ flex: p[band.key], background: band.color }} />
                        ) : null)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <Card title="Needs attention" sub="fund-level actions">
          {attention.map((item) => {
            const spec = ATTENTION[item.key];
            if (!spec) return null;
            return (
              <div key={item.key} className={`exec-q${item.unavailable ? " off" : ""}${item.count === 0 ? " quiet" : ""}`}>
                <span className={`exec-q-ico ${spec.tone}`} aria-hidden="true">{spec.icon}</span>
                <span className="exec-q-text">
                  <b>{item.unavailable ? `${spec.title(item)} · not tracked` : spec.title(item)}</b>
                  <span>{spec.sub(item)}</span>
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      <Card className="exec-row" title="Watchlist · projects to talk about" sub="active and suspended projects, widest gap between time elapsed and physical progress first">
        {watchlist.length === 0 ? <Empty>No active project in this selection.</Empty> : (
          <div className="table-wrap">
            <table className="table exec-watch">
              <thead>
                <tr>
                  <th>Project</th><th>Hub</th><th>Stage</th>
                  <th className="num">Time</th><th className="num">Physical</th>
                  <th className="num" title="No disbursement is recorded in the system.">Disb.</th>
                  <th className="num">DQ</th><th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((w) => (
                  <tr key={w.id} className="table-row-link" tabIndex={0}
                    onClick={() => onProjectClick?.(w.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") onProjectClick?.(w.id); }}>
                    <td className="exec-watch-project">
                      <span className="exec-code">{w.code}</span>
                      <span title={w.name}>{w.name}</span>
                    </td>
                    <td>{w.hub || "—"}</td>
                    <td><span className="exec-stage-pill"><i style={{ background: PHASE_COLOR[w.stage === "LS017" ? "exception" : "implementation"] }} />{w.stage_label}</span></td>
                    <td className="num">{fmtPct(w.time_elapsed_pct)}</td>
                    <td className="num">{fmtPct(w.physical_pct)}</td>
                    <td className="num exec-muted">—</td>
                    <td className="num">{w.dq_composite == null ? "—" : Math.round(w.dq_composite)}</td>
                    <td>
                      <span className="exec-flags">
                        {w.flags.map((f) => (
                          <span key={f.label} className={`badge ${f.tone === "bad" ? "badge-rose" : "badge-orange"}`}>{f.label}</span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Footnote>
        Status counts derive from the stage each project is in; time and physical progress are simple averages over
        the projects whose clock is running, not weighted by commitment. The deck reads status against disbursement,
        which no field records.
      </Footnote>
    </>
  );
}

/* ── 3 · pipeline & approvals ───────────────────────────────────────────── */

/* The deck's milestone strip, with the stages each milestone covers written
   underneath so the two readings cannot drift apart. */
function MilestoneStrip({ milestones }) {
  return (
    <div className="exec-ms">
      {milestones.map((m, i) => (
        <div key={m.key} className="exec-ms-step">
          <span className="exec-ms-dot" style={{ background: m.count ? PHASE_FILL[MILESTONE_PHASE[m.key]] : "var(--rule)" }}>{i}</span>
          <span className="exec-ms-label">{m.label}</span>
          <span className="exec-ms-stages">{m.stages.map((s) => s.code).join(" · ")}</span>
          <span className={`exec-ms-count${m.count ? " on" : ""}`}>{m.count || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function MilestoneGroups({ milestones, onProjectClick }) {
  const filled = milestones.filter((m) => m.count);
  if (filled.length === 0) return <Empty>No project in this selection.</Empty>;
  return (
    <>
      {filled.map((m) => (
        <div key={m.key} className="exec-grp">
          <div className="exec-grp-head" style={{ background: PHASE_FILL[MILESTONE_PHASE[m.key]] }}>
            {m.label}
            <span>{m.count} · {fmtUsd(m.value)}</span>
          </div>
          {m.projects.map((p) => (
            <div key={p.id} role="button" tabIndex={0} className="exec-pj"
              onClick={() => onProjectClick?.(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onProjectClick?.(p.id); }}>
              <Flag iso2={p.lead_iso2} size={16} title={p.lead_country} />
              <span className="exec-pj-name">
                <b>{p.lead_country || "No lead country"}</b>
                <span title={p.name}>{p.code} · {p.name}</span>
              </span>
              {p.sector && <span className="exec-pj-sector" style={{ color: p.sector_color || "var(--muted)" }}>{p.sector}</span>}
              <span className="exec-pj-amt">{p.committed_usd == null ? "—" : fmtUsd(p.committed_usd)}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function PipelineTab({ data, onProjectClick }) {
  const { breakdowns: b, milestones, startup_chain: chain } = data;
  const sequence = milestones.filter((m) => m.key !== "exception");
  const exception = milestones.find((m) => m.key === "exception");
  const gapMax = Math.max(1, ...chain.gaps.map((g) => g.months || 0));
  const cohortMax = Math.max(1, ...chain.signature_to_effective_by_year.map((c) => c.months));

  return (
    <>
      <Card className="exec-row" title="Last milestone reached" sub="the deck's seven milestones, and the lifecycle stages each one covers">
        <MilestoneStrip milestones={sequence} />
        {exception && exception.count > 0 && (
          <div className="ov-reason">
            {exception.count} project{exception.count === 1 ? " is" : "s are"} off the sequence
            ({exception.stages.map((s) => s.label).join(" or ").toLowerCase()}) and are counted apart.
          </div>
        )}
      </Card>

      <div className="fund-grid wide-left exec-row">
        <Card title="Projects by last milestone" sub="click a project to open it">
          <MilestoneGroups milestones={milestones} onProjectClick={onProjectClick} />
        </Card>
        <div className="grid" style={{ gap: 12, alignContent: "start" }}>
          <UntrackedCard
            title="Expected board approval"
            sub="IC approval cycle → expected BED cycle"
            reason={b.expected_bed.unavailable}
          />
          <Card title="Speed · start-up chain" sub="average months per phase · from dated stage changes">
            <div className="fund-bars">
              {chain.gaps.map((g, i) => (
                <Bar
                  key={i}
                  label={`${chain.steps[i].label} → ${chain.steps[i + 1].label}`}
                  value={g.months}
                  display={g.months == null ? "—" : String(g.months)}
                  max={gapMax}
                  suffix=" mo"
                  color="var(--blue)"
                  className={g.unavailable ? "off" : ""}
                  untracked={g.unavailable ? "not tracked" : "no dated pair yet"}
                />
              ))}
            </div>
            <div className="ov-reason">
              {chain.gaps.some((g) => g.projects)
                ? `Each average rests on the projects that recorded both dates (up to ${Math.max(...chain.gaps.map((g) => g.projects))}).`
                : "No project has recorded two dated stage changes of the chain yet."}
            </div>
            {chain.signature_to_effective_by_year.length > 0 && (
              <div className="ov-list" style={{ marginTop: 10 }}>
                <div className="ov-list-label">Signature → effectiveness, by year of signature</div>
                <div className="fund-bars">
                  {chain.signature_to_effective_by_year.map((c) => (
                    <Bar key={c.year} label={`${c.year} · ${c.projects}`} value={c.months} display={String(c.months)} max={cohortMax} suffix=" mo" color="var(--rose)" />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Footnote>
        A project sits at the milestone covering the stage it is in — the last one it reached, read from the
        lifecycle rather than typed in. The approval calendar the deck tabulates needs an expected board-approval
        date per project, which nothing records: the lifecycle keeps the dates of stages reached, not of stages
        foreseen.
      </Footnote>
    </>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function Overview({ onProjectClick }) {
  const [tab, setTab] = useState("distribution");
  const [type, setTypeState] = useProjectType();
  const [cycle, setCycle] = useState("");
  const [sector, setSector] = useState("");

  // Cycles and sectors belong to one type: switching type clears them.
  function setType(value) {
    setTypeState(value);
    setCycle("");
    setSector("");
  }

  const params = new URLSearchParams();
  params.set("type", type);
  if (cycle) params.set("cycle", cycle);
  if (sector) params.set("sector", sector);
  const query = params.toString();

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["executive-summary", type, cycle, sector],
    queryFn: () => apiFetch(`/api/projects/executive-summary/${query ? `?${query}` : ""}`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiFetch("/api/reference/sectors/"),
  });

  // The type's own taxonomy (ADR 0014); in IsDB a pillar takes all its
  // sectors (ADR 0007).
  const sectorOptions = typeSectorFilterOptions(sectors, type);

  const h = data?.headline;
  const funded = h ? h.projects - h.projects_without_financing : 0;

  return (
    <div className="view">
      <div className="view-header" style={{ marginBottom: 12 }}>
        <div className="view-eyebrow">
          Portfolio scope{h ? ` · ${h.projects} project${h.projects === 1 ? "" : "s"}` : ""}
          {data ? ` · as of ${data.as_of}` : ""}
        </div>
        <h1 className="view-title">Executive dashboard</h1>
        <p className="view-lead">
          The portfolio overview as the committee reads it — distribution, status and pipeline, on the record as it
          stands today.
        </p>
      </div>

      <div className="exec-filterbar">
        <ProjectTypeFilter value={type} onChange={setType} />
        {type === "llf" && (
          <>
            <span className="exec-fl">Cycle</span>
            <div className="exec-seg" role="group" aria-label="Investment cycle">
              {CYCLE_FILTERS.map((c) => (
                <button key={c.value} type="button" className={cycle === c.value ? "on" : ""}
                  aria-pressed={cycle === c.value} onClick={() => setCycle(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          </>
        )}
        <span className="exec-fl">Sector</span>
        <Select
          variant="filter"
          placeholder="All sectors"
          options={sectorOptions}
          value={sector}
          onChange={(v) => setSector(v === "" ? "" : String(v))}
          style={{ minWidth: 200 }}
        />
        <span className="exec-hub-note">Hub: set in the top bar</span>
        {h && (
          <span className="exec-res">
            <b>{h.projects}</b> project{h.projects === 1 ? "" : "s"} · US$ {fmtUsd(h.portfolio_usd)} committed
          </span>
        )}
      </div>
      <div style={{ margin: "8px 0 14px" }}>
        <RefreshBar dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={refetch} />
      </div>

      {isLoading && <div className="spinner" />}
      {error && <div className="notice notice-warn">{error.detail || "Could not load the executive dashboard."}</div>}

      {data && (
        <>
          {/* The headline strip stands above the tabs: the same six figures
              whichever way the portfolio is being read. */}
          <div className="grid exec-kpis">
            <Kpi
              label="Portfolio size"
              value={fmtUsd(h.portfolio_usd)}
              sub={h.projects_by_cycle.filter((c) => c.value != null).map((c) => `${c.label} ${fmtUsd(c.value)}`).join(" · ") || "no financing recorded"}
            />
            <Kpi label="Projects" value={h.projects} sub={h.projects_by_cycle.map((c) => `${c.count} ${c.label}`).join(" · ")} />
            <Kpi label="Countries" value={h.countries} sub={`${h.hubs} hub${h.hubs === 1 ? "" : "s"}`} />
            <Kpi
              label="Grant resources"
              value={fmtUsd(h.grant_usd)}
              sub={h.grant_share_pct == null ? "no financing recorded" : `${h.grant_share_pct}% of commitments${h.ocr_per_grant ? ` · OCR ${h.ocr_per_grant}× grant` : ""}`}
            />
            <UntrackedKpi label="Disbursed" reason={h.disbursed_unavailable} />
            <Kpi
              label="Average project"
              value={funded > 0 ? `≈ ${fmtUsd(h.portfolio_usd / funded)}` : "—"}
              sub={`US$ over the ${funded} project${funded === 1 ? "" : "s"} with financing`}
            />
          </div>
          <div className="ov-reason exec-basis">{data.breakdowns.trc_delta.unavailable}</div>

          <div className="wp-tabs exec-tabs">
            {TABS.map((t) => (
              <button key={t.key} type="button"
                className={`wp-tab${tab === t.key ? " on" : ""}`}
                onClick={() => setTab(t.key)}>
                {t.label} <span className="exec-tab-hint">{t.hint}</span>
              </button>
            ))}
          </div>

          {tab === "distribution" && <DistributionTab data={data} onProjectClick={onProjectClick} />}
          {tab === "status" && <StatusTab data={data} onProjectClick={onProjectClick} />}
          {tab === "pipeline" && <PipelineTab data={data} onProjectClick={onProjectClick} />}
        </>
      )}
    </div>
  );
}
