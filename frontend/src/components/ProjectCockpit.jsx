/**
 * ProjectCockpit — the read-only figures at the head of the project Overview.
 *
 * Four pieces, placed separately by ProjectDetail so they can sit around the
 * Identity and Classification cards rather than above them:
 *
 *   <CockpitStrip>      five tiles: cut-off, data quality, overdue, escalations, completion
 *   <StartupChain>      board approval → signature → effectiveness, with the gaps
 *   <ExecutionRow>      time elapsed vs physical delivery, and what is not tracked
 *   <SummaryCards>      workplan · indicators · data quality, each linking to its screen
 *
 * All four read one query, `/api/projects/<id>/overview-summary/`; react-query
 * dedupes it to a single request.
 *
 * Nothing here is editable and nothing owns its data: every card is a window
 * onto a module screen and says so with a link. Where the backend reports a
 * figure as unavailable, the reason is shown instead of a zero — see the
 * endpoint's docstring for why disbursement, procurement and risk cannot be
 * computed.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import Icon from "./Icon";
import { fmtNum } from "../utils.js";

export function useOverviewSummary(projectId) {
  return useQuery({
    queryKey: ["overview-summary", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/overview-summary/`),
    staleTime: 30_000,
  });
}

// Physical delivery against the clock. The bar takes the status hue of the
// gap, so the colour names an attribute of the data rather than decorating:
// on or near the clock is good, a widening gap requires attention.
const DELIVERY_BANDS = [
  { within: -5, token: "var(--green)", label: "on the clock" },
  { within: -15, token: "var(--orange)", label: "behind the clock" },
  { within: -Infinity, token: "var(--rose)", label: "well behind the clock" },
];

function deliveryBand(progressPct, elapsedPct) {
  if (progressPct == null || elapsedPct == null) return null;
  const gap = progressPct - elapsedPct;
  const band = DELIVERY_BANDS.find((b) => gap >= b.within) ?? DELIVERY_BANDS.at(-1);
  return { ...band, gap };
}

// The API sends plain dates ("2027-12-31"). new Date() would read them as UTC
// midnight and render the day before west of Greenwich, so the parts are read
// straight off the string.
function fmtDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

/* A tile that has no source. Mirrors the Tier III dashboard's "Not tracked". */
function UntrackedTile({ label, reason }) {
  return (
    <div className="kpi ov-tile off">
      <div className="kpi-label">{label}</div>
      <div className="ov-untracked">Not tracked</div>
      <div className="ov-reason">{reason}</div>
    </div>
  );
}

function Tile({ label, value, extra, tone }) {
  return (
    <div className={`kpi ov-tile${tone ? ` ov-tone-${tone}` : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value ov-tile-value">{value}</div>
      {extra && <div className="kpi-extra">{extra}</div>}
    </div>
  );
}

/* A link out to the module screen that owns the data shown above it. A screen
   the lifecycle has not unlocked yet says why instead of leading to a notice. */
function ViewLink({ label, tab, locks, onOpenTab }) {
  const lock = locks?.[tab];
  if (lock?.locked) {
    return (
      <span className="ov-view-link off" title={lock.reason}>
        <Icon name="lock" size={12} /> {lock.reason}
      </span>
    );
  }
  return (
    <button type="button" className="ov-view-link" onClick={() => onOpenTab(tab)}>
      {label} <Icon name="arrow-right" size={12} />
    </button>
  );
}

function Meter({ pct, color }) {
  return (
    <div className="ov-meter">
      <div
        className="ov-meter-fill"
        style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%`, background: color }}
      />
    </div>
  );
}

/* ── Cockpit strip ──────────────────────────────────────────────────────── */

export function CockpitStrip({ projectId }) {
  const { data } = useOverviewSummary(projectId);
  if (!data) return null;

  const { reporting, data_quality: dq, physical, escalations, time } = data;

  return (
    <div className="kpi-strip ov-strip">
      {reporting.reporting_unavailable ? (
        <UntrackedTile label="Next cut-off" reason={reporting.reporting_unavailable} />
      ) : (
        <Tile
          label="Next cut-off"
          value={reporting.days_to_cutoff == null ? "—" : `${reporting.days_to_cutoff} days`}
          extra={`${reporting.next_label || "—"} · ${fmtDate(reporting.next_due_date)}`}
          tone={reporting.days_to_cutoff != null && reporting.days_to_cutoff <= 30 ? "warn" : null}
        />
      )}

      {dq.dq_unavailable ? (
        <UntrackedTile label="Data quality" reason={dq.dq_unavailable} />
      ) : (
        <Tile
          label="Data quality"
          value={`${fmtNum(dq.composite)}%`}
          extra={`${dq.indicators_scored} indicators scored`}
        />
      )}

      {physical.progress_unavailable ? (
        <UntrackedTile label="Overdue activities" reason={physical.progress_unavailable} />
      ) : (
        <Tile
          label="Overdue activities"
          value={physical.activities_overdue}
          extra={`of ${physical.activities_total}`}
          tone={physical.activities_overdue > 0 ? "bad" : null}
        />
      )}

      {/* The mockup asks for a top risk here. There is no risk register, so
          the tile shows the schedule escalations it can actually count and
          names what it is not. */}
      <Tile
        label="Escalations"
        value={escalations.active_count}
        extra="schedule delays — no risk register yet"
        tone={escalations.active_count > 0 ? "bad" : null}
      />

      <Tile
        label="Completion"
        value={fmtDate(time.end_date)}
        extra={time.months_left == null ? "no end date" : `${time.months_left} months left`}
      />
    </div>
  );
}

/* ── Start-up chain ─────────────────────────────────────────────────────── */

export function StartupChain({ projectId }) {
  const { data } = useOverviewSummary(projectId);
  if (!data) return null;

  const { steps, gaps_months: gaps } = data.startup_chain;
  const reached = steps.filter((s) => s.date).length;
  if (!reached) return null;

  return (
    <div className="ov-chain">
      <div className="ov-chain-head">
        <span className="ov-chain-title">Start-up chain</span>
        <span className="ov-chain-sub">computed from the recorded lifecycle transitions</span>
      </div>
      <div className="ov-chain-track">
        {steps.map((step, i) => (
          <div className="ov-chain-cell" key={step.label}>
            <div className={`ov-chain-step${step.unavailable ? " off" : ""}`}>
              <span className="ov-chain-label">{step.label}</span>
              <span className="ov-chain-date">
                {step.unavailable ? "not recorded" : fmtDate(step.date)}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="ov-chain-gap">
                {gaps[i] == null ? "·" : `${gaps[i]} mo`}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="ov-note">
        Nothing in the system records a first disbursement, so the chain stops at
        effectiveness.
      </p>
    </div>
  );
}

/* ── Execution row ──────────────────────────────────────────────────────── */

export function ExecutionRow({ projectId }) {
  const { data } = useOverviewSummary(projectId);
  if (!data) return null;

  const { time, physical, financial } = data;
  const band = deliveryBand(physical.progress_pct, time.elapsed_pct);

  return (
    <>
      <div className="ov-section-head">
        <span className="ov-eyebrow">Execution</span>
        <h2 className="ov-section-title">Where the project stands</h2>
      </div>
      <div className="ov-exec">
        <div className="kpi ov-tile">
          <div className="kpi-label">Time elapsed</div>
          <div className="kpi-value ov-tile-value">
            {time.elapsed_pct == null ? "—" : `${fmtNum(time.elapsed_pct)}%`}
          </div>
          <div className="kpi-extra">
            {time.months_total == null
              ? time.elapsed_unavailable
              : `${time.months_elapsed} of ${time.months_total} months`}
          </div>
          <Meter pct={time.elapsed_pct} color="var(--subtle)" />
        </div>

        <div className="kpi ov-tile">
          <div className="kpi-label">Physical delivery</div>
          <div className="kpi-value ov-tile-value">
            {physical.progress_pct == null ? "—" : `${fmtNum(physical.progress_pct)}%`}
          </div>
          <div className="kpi-extra">
            {physical.progress_unavailable
              ? physical.progress_unavailable
              : `${physical.activities_total} activities · ${physical.activities_overdue} overdue`}
          </div>
          <Meter pct={physical.progress_pct} color={band ? band.token : "var(--rule)"} />
        </div>

        {/* The financial execution rate the mockup puts here cannot be
            computed: the envelope records commitments, not disbursements. */}
        <UntrackedTile
          label="Financial execution"
          reason={financial.disbursed_unavailable}
        />

        <div className="ov-narrative">
          {band ? (
            <>
              <p className="ov-narrative-title">
                Physical delivery is {band.label}
              </p>
              <p className="ov-narrative-text">
                {fmtNum(physical.progress_pct)}% of the workplan is done against{" "}
                {fmtNum(time.elapsed_pct)}% of the period elapsed — a gap of{" "}
                {fmtNum(Math.round(band.gap * 10) / 10)} points. The average is
                unweighted: activities count equally, because milestones carry no
                weight in the data model.
              </p>
            </>
          ) : (
            <>
              <p className="ov-narrative-title">Not enough recorded to compare</p>
              <p className="ov-narrative-text">
                Delivery against the clock needs both a start and end date and a
                workplan with activities.
              </p>
            </>
          )}
          <p className="ov-narrative-text ov-narrative-caveat">
            Whether the money has followed cannot be shown: no disbursement is
            recorded anywhere in the system, only what was committed.
          </p>
        </div>
      </div>
    </>
  );
}

/* ── Summary cards ──────────────────────────────────────────────────────── */

export function SummaryCards({ projectId, onOpenTab, locks }) {
  const { data } = useOverviewSummary(projectId);
  if (!data) return null;

  const { physical, indicators, data_quality: dq } = data;

  return (
    <div className="grid grid-2 ov-summaries">
      <div className="card ov-summary">
        <h2 className="card-title">Workplan</h2>
        {physical.progress_unavailable ? (
          <p className="ov-empty">{physical.progress_unavailable}</p>
        ) : (
          <>
            <p className="ov-summary-text">
              <b>{physical.activities_total} activities</b> ·{" "}
              {physical.activities_overdue > 0 ? (
                <span className="ov-flag">{physical.activities_overdue} overdue</span>
              ) : (
                "none overdue"
              )}
            </p>
            {physical.most_overdue.length > 0 && (
              <div className="ov-list">
                <div className="ov-list-label">Most overdue</div>
                {physical.most_overdue.map((a) => (
                  <div className="ov-list-row" key={a.code}>
                    <span>{a.name}</span>
                    <span className="ov-flag">{a.days_overdue} days</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <ViewLink label="Open the workplan" tab="workplan" locks={locks} onOpenTab={onOpenTab} />
      </div>

      <div className="card ov-summary">
        <h2 className="card-title">Indicators</h2>
        {indicators.indicators_unavailable ? (
          <p className="ov-empty">{indicators.indicators_unavailable}</p>
        ) : (
          <>
            <div className="ov-seg">
              <span style={{ flex: indicators.on_track, background: "var(--green)" }} />
              <span style={{ flex: indicators.off_track, background: "var(--orange)" }} />
              <span style={{ flex: indicators.not_reported, background: "var(--rule)" }} />
            </div>
            <div className="ov-legend">
              <span><i style={{ background: "var(--green)" }} />{indicators.on_track} on track</span>
              <span><i style={{ background: "var(--orange)" }} />{indicators.off_track} off track</span>
              <span><i style={{ background: "var(--rule)" }} />{indicators.not_reported} not yet reported</span>
            </div>
            <p className="ov-summary-text">
              <b>{indicators.total} indicators</b>
              {indicators.average_achievement != null &&
                ` · ${fmtNum(indicators.average_achievement)}% average achievement`}
              . On track is 90% of target or better, the same threshold the
              Results screen colours by.
            </p>
          </>
        )}
        <ViewLink label="Open the results" tab="results" locks={locks} onOpenTab={onOpenTab} />
      </div>

      <div className="card ov-summary">
        <h2 className="card-title">Data quality</h2>
        {dq.dq_unavailable ? (
          <p className="ov-empty">{dq.dq_unavailable}</p>
        ) : (
          <>
            <p className="ov-summary-text">
              <b>{fmtNum(dq.composite)}%</b> composite over {dq.indicators_scored}{" "}
              indicators
            </p>
            {[
              ["Completeness", dq.completeness, "var(--green)"],
              ["Timeliness", dq.timeliness, "var(--orange)"],
              ["Consistency", dq.consistency, "var(--blue)"],
              ["Accuracy", dq.accuracy, "var(--violet)"],
            ].map(([label, score, color]) => (
              <div className="ov-dim" key={label}>
                <div className="ov-dim-head">
                  <span>{label}</span>
                  <b>{fmtNum(score)}</b>
                </div>
                <Meter pct={score} color={color} />
              </div>
            ))}
            <p className="ov-note">
              Accuracy is a placeholder in the scoring service and always scores
              full marks; it is not yet a measurement.
            </p>
          </>
        )}
        <ViewLink label="Open the logframe" tab="logframe" locks={locks} onOpenTab={onOpenTab} />
      </div>

      <div className="card ov-summary">
        <h2 className="card-title">Financial envelope</h2>
        <p className="ov-summary-text">
          {data.financial.committed_usd
            ? <><b>{fmtNum(data.financial.committed_usd, { maxDecimals: 0 })} USD</b> committed across{" "}
                {data.financial.sources.length} financing sources</>
            : "No financing source has been recorded yet."}
        </p>
        {data.financial.sources.map((s) => (
          <div className="ov-dim" key={`${s.source}-${s.label}`}>
            <div className="ov-dim-head">
              <span>{s.label}</span>
              <b>{s.share_pct == null ? "—" : `${fmtNum(s.share_pct)}%`}</b>
            </div>
            <Meter pct={s.share_pct} color="var(--lime)" />
          </div>
        ))}
        <p className="ov-note">
          Commitments only. How much has been disbursed against them is not
          recorded anywhere in the system.
        </p>
        <ViewLink label="Open the financial tab" tab="financial" locks={locks} onOpenTab={onOpenTab} />
      </div>
    </div>
  );
}
