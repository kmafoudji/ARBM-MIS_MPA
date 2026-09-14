/**
 * Module 3 — the delay log of the whole project (SF-7).
 *
 * DelayLog records every revision of an activity's end date with the reason
 * it was taken. The two variance columns are the model's own: variance_days
 * is this revision, cumulative_variance_days is the approved total behind it.
 * Neither is relabelled here as "against baseline" — that figure would need a
 * plan-version object the system does not have.
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api";

const APPROVAL_CHIP = {
  pending: "badge-orange",
  approved: "badge-lime",
  rejected: "badge-rose",
};

function variance(days) {
  if (days == null) return <span className="wp-var-warn">—</span>;
  const cls = days > 30 ? "wp-var-bad" : "wp-var-warn";
  return <span className={cls}>+{days} d</span>;
}

export default function DelayLogTable({ projectId }) {
  const { data: delays = [], isLoading } = useQuery({
    queryKey: ["workplan-delays", projectId],
    queryFn: () => apiFetch(`/api/projects/${projectId}/workplan/delays/`),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="wp-foot">Loading the delay log…</div>;
  }

  if (!delays.length) {
    return (
      <div className="wp-gap">
        <div className="wp-gap-badge">No delay recorded</div>
        <p>
          No activity in this project has had its end date revised through the delay
          log. A revision entered from an activity's detail panel appears here with
          its reason code and its approval state.
        </p>
      </div>
    );
  }

  const pending = delays.filter(d => d.approval_status === "pending").length;

  return (
    <>
      <div className="wp-bar">
        <span className="wp-pad">
          {delays.length} recorded revisions{pending > 0 && ` · ${pending} awaiting approval`}
        </span>
        <span className="wp-pad quiet">
          Plan versions are not modelled — these are activity-level revisions
        </span>
      </div>

      <div className="table-wrap">
        <table className="table wp-delays">
          <thead>
            <tr>
              <th>Activity</th>
              <th className="num">This revision</th>
              <th className="num">Cumulative</th>
              <th>Reason</th>
              <th>Justification</th>
              <th className="num">End date moved</th>
              <th>Approval</th>
            </tr>
          </thead>
          <tbody>
            {delays.map(d => (
              <tr key={d.id}>
                <td>
                  <b>{d.activity_code}</b>
                  <span style={{ display: "block", color: "var(--muted)", fontSize: 10.5 }}>
                    {d.activity_name}
                  </span>
                </td>
                <td className="num">{variance(d.variance_days)}</td>
                <td className="num">{variance(d.cumulative_variance_days)}</td>
                <td>
                  <span className="badge badge-blue">{d.delay_category_display || d.delay_category}</span>
                  {d.delay_subcategory_display && (
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 3 }}>
                      {d.delay_subcategory_display}
                    </span>
                  )}
                </td>
                <td className="wp-just">{d.justification}</td>
                <td className="num">{d.previous_end} → {d.revised_end}</td>
                <td>
                  <span className={`badge ${APPROVAL_CHIP[d.approval_status] || "badge-off"}`}>
                    {d.approval_status_display || d.approval_status}
                  </span>
                  {d.cascade_applied && (
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 3 }}>
                      cascaded to successors
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
