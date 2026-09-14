import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Flag from "../components/Flag.jsx";
import Select from "../components/Select.jsx";
import RefreshBar from "../components/RefreshBar.jsx";
import { Bar, Card, Donut, Empty } from "../components/Charts.jsx";
import { deliveryBand } from "../components/ProjectCockpit.jsx";

/* Executive dashboard — the portfolio as leadership reads it.

   Built from the LLF executive-portfolio mockup, which lays the same record
   out three ways:
     A · monthly update, live   the pages of the monthly operations update
     B · portfolio analytics    what the Power BI portfolio page draws
     C · management cockpit     execution, speed and what needs attention

   Every figure comes from one endpoint, /api/projects/executive-summary/,
   computed live inside the user's scope and the hub chosen in the topbar.
   The mockup draws a good deal the system does not record — disbursement,
   contracts, procurement, regions, grant-eligibility tiers, country
   suspensions. Those cards are kept and say "Not tracked" with the reason,
   as on the Tier III page: a dashboard that shows 0% where it means "we do
   not record this" is worse than one that says so. */

const VIEWS = [
  { key: "a", letter: "A", name: "Monthly update, live", hint: "the report's pages, always current" },
  { key: "b", letter: "B", name: "Portfolio analytics",  hint: "where the commitments sit" },
  { key: "c", letter: "C", name: "Management cockpit",   hint: "execution, speed, attention" },
];

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

const CYCLE_COLOR = { LLF1: "var(--ink)", LLF2: "var(--lime)", none: "var(--subtle)" };

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

/* A card the mockup draws and the record cannot fill. */
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
                  ? ["LLF1", "LLF2", "none"].map((cycle) => b.by_cycle[cycle] ? (
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

/* ── A · monthly update, live ───────────────────────────────────────────── */

function MonthlyView({ data }) {
  const { headline: h, breakdowns: b, lifecycle, projects } = data;
  const cycles = Object.fromEntries(h.projects_by_cycle.map((c) => [c.label, c]));
  const llf2 = projects.filter((p) => p.cycle === "LLF2");
  const llf2Funded = llf2.filter((p) => p.committed_usd != null);
  const pipelineYears = b.by_pipeline_year;

  return (
    <>
      <div className="grid exec-kpis">
        <Kpi
          label="Portfolio size"
          value={fmtUsd(h.portfolio_usd)}
          sub={h.projects_by_cycle.filter((c) => c.value != null).map((c) => `${c.label} ${fmtUsd(c.value)}`).join(" · ") || "no financing recorded"}
        />
        <Kpi
          label="Projects"
          value={h.projects}
          sub={h.projects_by_cycle.map((c) => `${c.count} ${c.label}`).join(" · ")}
        />
        <Kpi label="Countries" value={h.countries} sub={`${h.hubs} hub${h.hubs === 1 ? "" : "s"}`} />
        <Kpi
          label="Grant resources"
          value={fmtUsd(h.grant_usd)}
          sub={h.grant_share_pct == null ? "no financing recorded" : `${h.grant_share_pct}% of commitments${h.ocr_per_grant ? ` · OCR ${h.ocr_per_grant}× grant` : ""}`}
        />
        <UntrackedKpi label="Disbursed" reason={h.disbursed_unavailable} />
        <Kpi label="SDGs addressed" value={h.sdgs} sub="carried by at least one project" />
      </div>

      {h.projects_without_financing > 0 && (
        <div className="notice notice-info exec-notice">
          {h.projects_without_financing} project{h.projects_without_financing === 1 ? " carries" : "s carry"} no
          financing line: counted as projects, left out of every amount rather than shown as zero.
        </div>
      )}

      <div className="grid grid-4 exec-row">
        <Card title="By pipeline year" sub="US$ · year of IC endorsement">
          {pipelineYears.unavailable ? (
            <Empty>{pipelineYears.unavailable}</Empty>
          ) : (
            <Donut rows={pipelineYears.rows} colors={["var(--lime)", "var(--blue)", "var(--violet)", "var(--orange)", "var(--rose)", "var(--ink-soft)"]} format={fmtUsd} />
          )}
          {pipelineYears.projects_without_year > 0 && (
            <div className="ov-reason">{pipelineYears.projects_without_year} project(s) have no dated endorsement.</div>
          )}
        </Card>
        <Card title="By sector" sub="US$ · primary sector">
          <Donut rows={b.by_sector} colors={["var(--lime)"]} format={fmtUsd} />
        </Card>
        <UntrackedCard title="By region" sub="US$" reason={b.by_region.unavailable} />
        <Card title="By financing source" sub="US$ · commitments">
          <Donut rows={b.by_source} color="var(--violet)" format={fmtUsd} />
          <div className="ov-reason">Grant-eligibility tiers: {b.by_grant_tier.unavailable.toLowerCase()}</div>
        </Card>
      </div>

      <div className="grid grid-3 exec-row">
        <Card title="Projects by stage" sub="lifecycle, split by fund">
          <StageColumns buckets={lifecycle} stacked />
          <Legend items={[
            { label: `LLF1 · ${cycles.LLF1?.count ?? 0}`, color: CYCLE_COLOR.LLF1 },
            { label: `LLF2 · ${cycles.LLF2?.count ?? 0}`, color: CYCLE_COLOR.LLF2 },
            ...(cycles["No cycle"] ? [{ label: `No cycle · ${cycles["No cycle"].count}`, color: CYCLE_COLOR.none }] : []),
          ]} />
        </Card>
        <UntrackedCard title="Disbursement by pipeline year" sub="disbursed vs remaining" reason={b.disbursement.unavailable} />
        <Card title="LLF2 · stage of the pipeline" sub={`${llf2.length} project${llf2.length === 1 ? "" : "s"}`}>
          {llf2.length === 0
            ? <Empty>No LLF2 project in this selection.</Empty>
            : <StageColumns buckets={lifecycle.filter((bk) => bk.key !== "exception")} count={(bk) => bk.by_cycle.LLF2} />}
        </Card>
      </div>

      {llf2.length > 0 && (
        <Card
          className="exec-row"
          title="LLF2 · investments and geographic coverage"
          sub={`${llf2.length} project${llf2.length === 1 ? "" : "s"} · ${new Set(llf2.flatMap((p) => p.countries)).size} countries · US$ ${fmtUsd(llf2Funded.reduce((s, p) => s + p.committed_usd, 0))}`}
        >
          <div className="exec-countries">
            {llf2.map((p) => (
              <div key={p.id} className="exec-country">
                <div className="exec-country-head">
                  <Flag iso2={p.lead_iso2} size={16} title={p.lead_country} />
                  <b>{p.lead_country || "No lead country"}</b>
                </div>
                <div className="exec-country-amt">{p.committed_usd == null ? "—" : `USD ${fmtUsd(p.committed_usd)}`}</div>
                <div className="exec-country-name" title={p.name}>{p.code} · {p.name}</div>
              </div>
            ))}
            {llf2Funded.length > 0 && (
              <div className="exec-country avg">
                <b>Average LLF2 project</b>
                <div className="exec-country-amt">≈ USD {fmtUsd(llf2Funded.reduce((s, p) => s + p.committed_usd, 0) / llf2Funded.length)}</div>
                <div className="exec-country-name">over the {llf2Funded.length} with financing recorded</div>
              </div>
            )}
          </div>
        </Card>
      )}

      <Footnote>
        The pages of the monthly operations update, rendered from the shared record instead of assembled in
        slides. Amounts are commitments; nothing here is a disbursement.
      </Footnote>
    </>
  );
}

/* ── B · portfolio analytics ────────────────────────────────────────────── */

function AnalyticsView({ data, onProjectClick }) {
  const { headline: h, breakdowns: b } = data;
  const maxOf = (rows) => Math.max(1, ...rows.map((r) => r.value || 0));

  return (
    <>
      <div className="grid exec-kpis">
        <Kpi label="Commitments" value={fmtUsd(h.portfolio_usd)} sub="sum of financing lines" />
        <Kpi label="Grants" value={fmtUsd(h.grant_usd)} sub={h.grant_share_pct == null ? "—" : `${h.grant_share_pct}% of commitments`} meter={h.grant_share_pct} meterColor="var(--violet)" />
        <Kpi label="Projects" value={h.projects} sub={`${h.projects_without_financing} without financing`} />
        <Kpi label="Countries" value={h.countries} />
        <Kpi label="Regional hubs" value={h.hubs} sub="with a project in scope" />
        <UntrackedKpi label="Disbursed" reason={h.disbursed_unavailable} />
      </div>

      <div className="fund-grid two exec-row">
        <Card title="Commitments by sector" sub="US$ · share of the total">
          <div className="fund-bars">
            {b.by_sector.map((r) => (
              <Bar key={r.label} label={`${r.label} · ${r.count}`} value={r.value} display={fmtUsd(r.value)}
                max={maxOf(b.by_sector)} suffix={r.share == null ? "" : ` · ${r.share}%`}
                color={r.color || "var(--lime)"} untracked="no financing recorded" />
            ))}
          </div>
        </Card>
        <Card title="Commitments by hub" sub="US$ · the project's hub, else its lead country's">
          <div className="fund-bars">
            {b.by_hub.map((r) => (
              <Bar key={r.label} label={`${r.label} · ${r.count}`} value={r.value} display={fmtUsd(r.value)}
                max={maxOf(b.by_hub)} suffix={r.share == null ? "" : ` · ${r.share}%`}
                color="var(--blue)" untracked="no financing recorded" />
            ))}
          </div>
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
                    color={r.cycle === "LLF1" ? "var(--ink)" : "var(--lime-darker)"} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Financing by instrument" sub="US$ · commitments">
          <Donut rows={b.by_instrument} color="var(--orange)" format={fmtUsd} />
        </Card>
      </div>

      <div className="grid grid-4 exec-row">
        <Card title="Budget by type of work" sub="US$ · indicative component allocations">
          {b.by_work_type.length === 0
            ? <Empty>No component allocation has been recorded.</Empty>
            : <Donut rows={b.by_work_type} color="var(--lime)" format={fmtUsd} />}
        </Card>
        <UntrackedCard title="Contracts signed by year" sub="number · by status" reason={b.contracts.unavailable} />
        <UntrackedCard title="Contract risk profile" sub="by hub" reason={b.contracts.unavailable} />
        <UntrackedCard title="Procurement method mix" sub="share of packages" reason={b.procurement.unavailable} />
      </div>

      <Footnote>
        The content of the Power BI portfolio page, on commitments. Its disbursed-versus-undisbursed splits need
        a record of disbursements, and its contract and procurement panels a procurement module — neither exists
        yet. Filters are the bar above and the hub in the topbar, not the charts.
      </Footnote>
    </>
  );
}

/* ── C · management cockpit ─────────────────────────────────────────────── */

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

function CockpitView({ data, onProjectClick }) {
  const { execution: x, lifecycle, startup_chain: chain, results, attention, watchlist } = data;
  const gapMax = Math.max(1, ...chain.gaps.map((g) => g.months || 0));
  const cohortMax = Math.max(1, ...chain.signature_to_effective_by_year.map((c) => c.months));

  return (
    <>
      <div className="ov-exec">
        {x.time_elapsed_pct == null
          ? <UntrackedKpi label="Time elapsed" reason={x.time_unavailable} />
          : <Kpi label="Time elapsed" value={fmtPct(x.time_elapsed_pct)} sub={`of implementation periods · ${x.time_projects} active project${x.time_projects === 1 ? "" : "s"}`} meter={x.time_elapsed_pct} meterColor="var(--muted)" />}
        <UntrackedKpi label="Financial · disbursed" reason={x.financial_unavailable} />
        {x.physical_pct == null
          ? <UntrackedKpi label="Physical progress" reason={x.physical_unavailable} />
          : <Kpi label="Physical progress" value={fmtPct(x.physical_pct)} sub={`${x.physical_projects} of ${x.active_projects} with a workplan · simple average`} meter={x.physical_pct} meterColor="var(--green)" />}
        <Verdict execution={x} watchlist={watchlist} />
      </div>

      <div className="grid grid-3 exec-row">
        <Card title="Portfolio by lifecycle stage" sub={`${data.headline.projects} projects · stages grouped as the monthly update shows them`}>
          <StageColumns buckets={lifecycle} />
          <Legend items={[
            { label: "Pre-approval", color: PHASE_COLOR.pre_approval },
            { label: "Implementation", color: PHASE_COLOR.implementation },
            { label: "Closure", color: PHASE_COLOR.closure },
            { label: "Exception", color: PHASE_COLOR.exception },
          ]} />
        </Card>

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
                <div className="ov-list-label">By pillar</div>
                {results.by_pillar.map((p) => {
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
      </div>

      <div className="exec-split exec-row">
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

        <Card title="Watchlist · projects to talk about this month" sub="active and suspended projects, widest gap between time elapsed and physical progress first">
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
      </div>

      <div className="fund-banner">
        <b>What this view adds:</b> the monthly update and Power BI answer "how big and how committed". This one
        asks "how fast, how well, and where do I look" — and says plainly where the record cannot answer yet.
      </div>
    </>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */

export default function Overview({ onProjectClick }) {
  const [view, setView] = useState("a");
  const [cycle, setCycle] = useState("");
  const [sector, setSector] = useState("");

  const params = new URLSearchParams();
  if (cycle) params.set("cycle", cycle);
  if (sector) params.set("sector", sector);
  const query = params.toString();

  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["executive-summary", cycle, sector],
    queryFn: () => apiFetch(`/api/projects/executive-summary/${query ? `?${query}` : ""}`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const { data: sectors } = useQuery({
    queryKey: ["sectors"],
    queryFn: () => apiFetch("/api/reference/sectors/"),
  });

  // Pillars first in their group, then their sectors (ADR 0007): choosing a
  // pillar takes all its sectors.
  const sectorOptions = (sectors || [])
    .filter((s) => s.is_active !== false)
    .sort((a, b) => (a.pillar_name || a.name).localeCompare(b.pillar_name || b.name) || Number(!a.is_pillar) - Number(!b.is_pillar) || a.name.localeCompare(b.name))
    .map((s) => ({
      value: s.id,
      label: s.is_pillar ? `${s.name} · all sectors` : s.name,
      group: s.is_pillar ? s.name : s.pillar_name || s.parent_name || "Sectors",
    }));

  const h = data?.headline;

  return (
    <div className="view">
      <div className="view-header" style={{ marginBottom: 12 }}>
        <div className="row-between" style={{ alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="view-eyebrow">
              Portfolio scope{h ? ` · ${h.projects} project${h.projects === 1 ? "" : "s"}` : ""}
            </div>
            <h1 className="view-title">Executive dashboard</h1>
            <p className="view-lead">The portfolio as leadership reads it — three ways to lay out the same record.</p>
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
      </div>

      <div className="exec-filterbar">
        <span className="exec-fl">Fund</span>
        <div className="exec-seg" role="group" aria-label="Investment cycle">
          {CYCLE_FILTERS.map((c) => (
            <button key={c.value} type="button" className={cycle === c.value ? "on" : ""}
              aria-pressed={cycle === c.value} onClick={() => setCycle(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
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

      {data && view === "a" && <MonthlyView data={data} />}
      {data && view === "b" && <AnalyticsView data={data} onProjectClick={onProjectClick} />}
      {data && view === "c" && <CockpitView data={data} onProjectClick={onProjectClick} />}
    </div>
  );
}
