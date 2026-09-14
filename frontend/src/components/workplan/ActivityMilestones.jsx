/**
 * Module 3 — activities read as milestone chains.
 *
 * One row per activity: the chain of milestones it has to pass, the three
 * dates it carries stacked so a slippage reads as a step, and the progress
 * figure. The progress figure is entered by hand — see the note at the foot
 * of this view; Milestone has no weight column, so nothing here can derive it.
 */

import {
  barSpan,
  buildWindow,
  currentEnd,
  flattenActivities,
  truncate,
} from "./planUtils";

const STATUS_CHIP = {
  not_started: { cls: "badge-off", label: "Not started" },
  in_progress: { cls: "badge-blue", label: "In progress" },
  on_hold: { cls: "badge-orange", label: "On hold" },
  completed: { cls: "badge-violet", label: "Completed" },
  cancelled: { cls: "badge-rose", label: "Cancelled" },
};

function MilestoneChain({ milestones }) {
  if (!milestones.length) {
    return <div className="wp-mst-lab">No milestone recorded</div>;
  }

  const sorted = [...milestones].sort(
    (a, b) => (a.planned_date || "").localeCompare(b.planned_date || "") || a.order - b.order,
  );
  const achieved = sorted.filter(m => m.status === "achieved").length;
  const next = sorted.find(m => m.status !== "achieved");

  return (
    <>
      <div className="wp-mst">
        {sorted.flatMap((m, i) => {
          const node = (
            <span
              key={`n${m.id}`}
              className={`wp-mst-n ${m.status}${m.is_gate ? " gate" : ""}`}
              title={`${m.name} · ${m.status_display || m.status} · planned ${m.planned_date}${
                m.actual_date ? ` · reached ${m.actual_date}` : ""
              }${m.is_gate ? " · gate" : ""}`}
            />
          );
          if (i === 0) return [node];
          return [
            <span
              key={`l${m.id}`}
              className={`wp-mst-l${sorted[i - 1].status === "achieved" ? " done" : ""}`}
            />,
            node,
          ];
        })}
      </div>
      <div className="wp-mst-lab">
        {achieved} of {sorted.length} achieved
        {next && ` · next: ${truncate(next.name, 34)}`}
      </div>
    </>
  );
}

function ThreeValues({ activity, win }) {
  const base = barSpan(win, activity.baseline_start, activity.baseline_end);
  const cur = barSpan(win, activity.planned_start, currentEnd(activity));
  const act = activity.actual_end
    ? barSpan(win, activity.planned_start || activity.baseline_start, activity.actual_end)
    : null;

  return (
    <div>
      <div className="wp-tv">
        {base && <span className="wp-tv-base" style={base} title={`Baseline ${activity.baseline_start} → ${activity.baseline_end}`} />}
        {cur && <span className="wp-tv-cur" style={cur} title={`Current plan ${activity.planned_start} → ${currentEnd(activity)}`} />}
        {act && (
          <span
            className={`wp-tv-act${activity.is_overdue ? " late" : ""}`}
            style={act}
            title={`Actual end ${activity.actual_end}`}
          />
        )}
      </div>
      <div className="wp-tv-legend">baseline · current plan · actual</div>
    </div>
  );
}

export default function ActivityMilestones({ components = [], onActivityClick }) {
  const activities = flattenActivities(components);
  const win = buildWindow(activities);

  if (!activities.length) {
    return (
      <div className="wp-gap">
        <div className="wp-gap-badge">No activity</div>
        <p>This workplan has no activity yet. Add one from the Structure tab.</p>
      </div>
    );
  }

  const withMilestones = activities.filter(a => (a.milestones || []).length > 0).length;
  const gated = activities.filter(a => (a.milestones || []).some(m => m.is_gate)).length;

  return (
    <>
      <div className="wp-bar">
        <span className="wp-pad">
          {activities.length} activities · {withMilestones} carry milestones · {gated} hold a gate
        </span>
        <span className="wp-pad quiet">Progress % is entered by hand, not derived</span>
        <div className="wp-legend">
          <span><i style={{ background: "var(--subtle)" }} />baseline</span>
          <span><i style={{ background: "var(--sec-climate-pale)", border: "1.5px solid var(--blue)" }} />current</span>
          <span><i style={{ background: "var(--lime)" }} />actual</span>
        </div>
      </div>

      {activities.map(activity => {
        const chip = STATUS_CHIP[activity.status] || STATUS_CHIP.not_started;
        const node = activity.output_node_detail;
        return (
          <button
            type="button"
            key={activity.id}
            className="wp-act"
            onClick={() => onActivityClick?.(activity)}
          >
            <span className="wp-act-nm">
              <b>{activity.code} · {activity.name}</b>
              <span className="wp-act-meta">
                {activity.responsible_user_detail?.full_name || activity.responsible_party || "No responsible party"}
                {node && (
                  <>
                    {" · feeds "}
                    <span className="wp-lk">
                      {node.code}
                      {node.indicator_code ? ` → ${node.indicator_code}` : ""}
                    </span>
                  </>
                )}
              </span>
            </span>

            <span><MilestoneChain milestones={activity.milestones || []} /></span>

            {win ? <ThreeValues activity={activity} win={win} /> : <span />}

            <span className="wp-act-right">
              <span className={`badge ${activity.is_overdue ? "badge-rose" : chip.cls}`}>
                {activity.is_overdue
                  ? `Overdue ${activity.schedule_variance_days ? `+${activity.schedule_variance_days}d` : ""}`.trim()
                  : chip.label}
              </span>
              <span className="wp-act-pct">{activity.progress}%</span>
              <span className="wp-act-ev">
                {(activity.milestones || []).length} milestones
                {activity.pending_delays_count > 0 && ` · ${activity.pending_delays_count} delay pending`}
              </span>
            </span>
          </button>
        );
      })}

      <div className="wp-gap" style={{ marginTop: "var(--s-3)", textAlign: "left" }}>
        <div className="wp-gap-badge">Progress is typed, not earned</div>
        <p style={{ margin: 0 }}>
          The client's pack reads progress as the weighted sum of the milestones an
          activity has reached, each with its evidence. This system stores no weight on
          a milestone and overwrites <code>Activity.progress</code> in place, so the
          figure above is whatever was last entered and a "Not started" activity can
          still read 100%. Deriving it needs a weight column on Milestone and a rule
          for what a gate milestone blocks.
        </p>
      </div>
    </>
  );
}
