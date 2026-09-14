/**
 * Module 3 — one reading of the workplan record, shared by the tabs.
 *
 * Every activity carries three values: a frozen baseline (baseline_start /
 * baseline_end, editable=False), the current plan (planned_start →
 * revised_end || planned_end) and what actually happened (actual_end). The
 * quarter grid, the milestone list and the delay log must read them the same
 * way, so the reading lives here rather than in each view.
 */

export const parseDate = s => (s ? new Date(s + "T00:00:00") : null);

const DAY = 86400000;

/** The end date the current plan stands on — a revision supersedes the plan. */
export const currentEnd = a => a.revised_end || a.planned_end || null;

/** Strip HTML: ToC statements are stored as rich text. */
export function plain(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function truncate(text, n) {
  const s = plain(text);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ── Activities ───────────────────────────────────────────────────────── */

/** Depth-first walk of Component → Sub-Component → Activity. */
export function flattenActivities(components = []) {
  const out = [];
  for (const c of components) {
    for (const s of c.sub_components || []) {
      for (const a of s.activities || []) {
        if (a.is_active === false) continue;
        out.push({ ...a, _component: c, _sub: s });
      }
    }
  }
  return out;
}

/* ── The window every view is drawn on ────────────────────────────────── */

const DATE_KEYS = [
  "baseline_start", "baseline_end",
  "planned_start", "planned_end",
  "revised_end", "actual_end",
];

/**
 * Full calendar years spanning every date the workplan mentions. Whole years
 * keep the quarter columns aligned under their year header.
 */
export function buildWindow(activities = []) {
  const stamps = [];
  for (const a of activities) {
    for (const k of DATE_KEYS) {
      const d = parseDate(a[k]);
      if (d) stamps.push(d.getTime());
    }
  }
  if (!stamps.length) return null;
  const startYear = new Date(Math.min(...stamps)).getFullYear();
  const endYear = new Date(Math.max(...stamps)).getFullYear();
  const years = [];
  for (let y = startYear; y <= endYear; y += 1) years.push(y);
  return {
    startYear,
    endYear,
    years,
    cols: years.length * 4,
    from: new Date(startYear, 0, 1),
    to: new Date(endYear, 11, 31),
  };
}

const qIndex = (date, startYear) =>
  (date.getFullYear() - startYear) * 4 + Math.floor(date.getMonth() / 3);

/**
 * One class per quarter column. Precedence is deliberate: the baseline band
 * only shows where the current plan has moved away from it, delivery covers
 * the plan, and an overdue tail covers everything.
 */
export function quarterCells(activity, win, today = new Date()) {
  const cells = new Array(win.cols).fill("");
  const mark = (from, to, cls) => {
    if (!from || !to) return;
    const a0 = qIndex(from, win.startYear);
    const a1 = Math.max(a0, qIndex(to, win.startYear));
    for (let i = Math.max(0, a0); i <= Math.min(win.cols - 1, a1); i += 1) cells[i] = cls;
  };

  mark(parseDate(activity.baseline_start), parseDate(activity.baseline_end), "base");
  const start = parseDate(activity.planned_start) || parseDate(activity.baseline_start);
  mark(start, parseDate(currentEnd(activity)), "plan");

  // Delivery is only claimed where the record says so: there is no actual
  // start date in the schema, so a completed activity is shaded from its plan
  // start to the end it actually reached.
  if (activity.status === "completed" && activity.actual_end) {
    mark(start, parseDate(activity.actual_end), "done");
  }
  if (activity.is_overdue) {
    mark(parseDate(currentEnd(activity)), today, "late");
  }
  return cells;
}

/** Quarter column holding today, or -1 when today falls outside the window. */
export function todayColumn(win, today = new Date()) {
  const i = qIndex(today, win.startYear);
  return i >= 0 && i < win.cols ? i : -1;
}

/** Left/width in percent of the window, for the three stacked value bars. */
export function barSpan(win, from, to) {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  const total = (win.to - win.from) / DAY || 1;
  const left = Math.max(0, (a - win.from) / DAY);
  const width = Math.max(1, (Math.max(a, b) - a) / DAY);
  return {
    left: `${(left / total) * 100}%`,
    width: `${(Math.min(width, total - left) / total) * 100}%`,
  };
}

/* ── Results chain ────────────────────────────────────────────────────── */

const UNLINKED = "Not linked to the results framework";

/**
 * Group activities as the workplan pack reads them: outcome → output →
 * activity, using the Theory of Change link (Activity.output_node). An
 * activity with no link falls back to its Component → Sub-Component and is
 * flagged, because an unlinked activity delivers no output and is worth
 * seeing as a gap rather than hiding among the linked ones.
 */
export function groupByResultsChain(components = []) {
  const groups = new Map();

  const bucket = (key, head) => {
    if (!groups.has(key)) groups.set(key, { key, ...head, outputs: new Map() });
    return groups.get(key);
  };

  for (const activity of flattenActivities(components)) {
    const node = activity.output_node_detail;
    let group;
    let outKey;
    let out;

    if (node) {
      const outcomeCode = node.parent_code || "—";
      group = bucket(`o:${outcomeCode}`, {
        linked: true,
        code: outcomeCode,
        label: plain(node.parent_statement) || "Outcome",
      });
      outKey = `n:${node.id}`;
      out = {
        key: outKey,
        code: node.code || "—",
        label: plain(node.statement),
        indicatorCode: node.indicator_code || null,
        indicatorName: node.indicator_name || null,
      };
    } else {
      const c = activity._component;
      const s = activity._sub;
      group = bucket(`c:${c.id}`, {
        linked: false,
        code: c.code,
        label: c.name,
        note: UNLINKED,
      });
      outKey = `s:${s.id}`;
      out = { key: outKey, code: s.code, label: s.name, indicatorCode: null, indicatorName: null };
    }

    if (!group.outputs.has(outKey)) group.outputs.set(outKey, { ...out, activities: [] });
    group.outputs.get(outKey).activities.push(activity);
  }

  return [...groups.values()]
    .map(g => {
      const outputs = [...g.outputs.values()].sort((a, b) => a.code.localeCompare(b.code));
      const activities = outputs.flatMap(o => o.activities);
      return {
        ...g,
        outputs,
        count: activities.length,
        budget: activities.reduce((sum, a) => sum + Number(a.budget_planned || 0), 0),
      };
    })
    .sort((a, b) => Number(b.linked) - Number(a.linked) || a.code.localeCompare(b.code));
}
