/**
 * Module 3 — the multi-annual plan, by quarter.
 *
 * The same activities the structure tab edits, grouped by the results chain
 * they deliver, spread over calendar quarters. Nothing here is stored: every
 * band is read from the three dates on the activity.
 */

import { fmtCurrency } from "../../utils.js";
import {
  buildWindow,
  currentEnd,
  flattenActivities,
  groupByResultsChain,
  quarterCells,
  todayColumn,
  truncate,
} from "./planUtils";

function Legend() {
  return (
    <div className="wp-legend">
      <span><i style={{ background: "var(--ground)" }} />baseline only</span>
      <span><i style={{ background: "var(--sec-climate-bg)" }} />current plan</span>
      <span><i style={{ background: "var(--lime)" }} />delivered</span>
      <span><i style={{ background: "var(--sec-health)" }} />overdue</span>
      <span><i style={{ background: "var(--paper)", border: "1px solid var(--sec-health)" }} />today</span>
    </div>
  );
}

function ActivityRow({ activity, win, nowCol, onClick }) {
  const cells = quarterCells(activity, win);
  const end = currentEnd(activity);
  const title = [
    `Baseline: ${activity.baseline_start || "—"} → ${activity.baseline_end || "—"}`,
    `Current plan: ${activity.planned_start || "—"} → ${end || "—"}`,
    `Actual end: ${activity.actual_end || "—"}`,
  ].join("\n");

  return (
    <button type="button" className="wp-prow" onClick={onClick} title={title}>
      <span className="wp-prow-nm">
        <span>{activity.code}</span>
        {activity.name}
      </span>
      {cells.map((cls, i) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className={`wp-q ${cls}${i === nowCol ? " now" : ""}`.trim()}
        />
      ))}
    </button>
  );
}

export default function MultiAnnualPlan({ components = [], onActivityClick }) {
  const activities = flattenActivities(components);
  const win = buildWindow(activities);

  if (!win) {
    return (
      <div className="wp-gap">
        <div className="wp-gap-badge">No dated activity</div>
        <p>
          The plan is drawn from the dates on the activities. None of the activities
          in this workplan carries a start or an end, so there is nothing to place on
          a calendar yet.
        </p>
      </div>
    );
  }

  const groups = groupByResultsChain(components);
  const nowCol = todayColumn(win);
  const style = { "--wp-cols": win.cols };

  return (
    <>
      <div className="wp-bar">
        <span className="wp-pad">
          Results chain → activities · {win.startYear}–{win.endYear} by quarter
        </span>
        <span className="wp-pad blue">Neutral band = frozen baseline the plan has moved away from</span>
        <Legend />
      </div>

      <div className="wp-grid-scroll">
        <div className="wp-grid">
          <div className="wp-qhead" style={style}>
            <span />
            {win.years.map(y => (
              <span key={y} className="wp-yr" style={{ gridColumn: "span 4" }}>{y}</span>
            ))}
          </div>

          {groups.map(group => (
            <div key={group.key}>
              <div className={`wp-outcome${group.linked ? "" : " unlinked"}`}>
                <span className="wp-cid">{group.code}</span>
                <span>{truncate(group.label, 110)}</span>
                <span className="wp-meta">
                  {group.count} {group.count === 1 ? "activity" : "activities"}
                  {group.budget > 0 && ` · ${fmtCurrency(group.budget, "USD")} planned`}
                </span>
              </div>
              {!group.linked && (
                <div className="wp-output">
                  <span className="wp-oid">no ToC link</span>
                  <span>
                    These activities are grouped by workplan component because they are
                    not linked to a Theory of Change output — they deliver nothing the
                    results framework measures.
                  </span>
                </div>
              )}

              {group.outputs.map(output => (
                <div key={output.key}>
                  <div className="wp-output">
                    <span className="wp-oid">{output.code}</span>
                    <span>{truncate(output.label, 130)}</span>
                    {output.indicatorCode ? (
                      <span className="wp-ind" title={output.indicatorName || ""}>
                        → {output.indicatorCode}
                      </span>
                    ) : (
                      group.linked && <span className="wp-ind off">no indicator on this output</span>
                    )}
                  </div>
                  <div style={style}>
                    {output.activities.map(activity => (
                      <ActivityRow
                        key={activity.id}
                        activity={activity}
                        win={win}
                        nowCol={nowCol}
                        onClick={() => onActivityClick?.(activity)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="wp-foot">
        <span>{activities.length} activities · {groups.length} groups</span>
        <span>
          Each activity sits under the output it delivers and the indicator that output
          feeds: the plan and the results framework are the same record.
        </span>
      </div>
    </>
  );
}
