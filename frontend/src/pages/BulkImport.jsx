/**
 * BulkImport — loading an AS-IS workbook (13 sheets).
 *
 * Two steps, imposed by the design: validate, read what is going to change,
 * then confirm. The file is stored nowhere on the server — the same File
 * object is sent back on confirm, together with the SHA-256 the validation
 * returned. The server recomputes it and refuses anything that is not the
 * file that was reviewed (409).
 */
import { useState } from "react";
import { apiUpload } from "../api";
import Icon from "../components/Icon";

const ENDPOINT = "/api/import/asis/";

const ACTION_STYLE = {
  create:    { label: "Created",   color: "#16a34a", bg: "#dcfce7" },
  update:    { label: "Updated",   color: "#d97706", bg: "#fef9c3" },
  // The only destructive action, and the only one coloured as a warning:
  // rows the file dropped from a table that has no key to match on.
  delete:    { label: "Deleted",   color: "#dc2626", bg: "#fee2e2" },
  replace:   { label: "Replaced",  color: "#6366f1", bg: "#e0e7ff" },
  unchanged: { label: "Unchanged", color: "#6b7280", bg: "#f3f4f6" },
};

const ACTION_ORDER = ["create", "update", "delete", "replace", "unchanged"];

/** The report arrives in the response body, including on a 422. */
function reportFrom(error) {
  const detail = error?.detail;
  if (detail && Array.isArray(detail.changes)) return detail;
  return null;
}

function messageFrom(error) {
  return error?.detail?.detail || error?.message || "Unexpected error.";
}

function ActionTag({ action }) {
  const style = ACTION_STYLE[action] || ACTION_STYLE.unchanged;
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: 99,
      fontSize: 11, fontWeight: 700, color: style.color, background: style.bg,
      whiteSpace: "nowrap",
    }}>{style.label}</span>
  );
}

function IssueList({ title, items, tone }) {
  if (!items.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${tone.color}` }}>
      <div className="card-header">
        <div>
          <div className="card-title" style={{ color: tone.color }}>
            <Icon name={tone.icon} size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {title} ({items.length})
          </div>
        </div>
      </div>
      <div className="card-body" style={{ maxHeight: 260, overflowY: "auto" }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {items.map((issue, index) => (
            <li key={index}>
              <code style={{ fontSize: 11, color: "#6b7280" }}>
                {issue.sheet}{issue.row ? `:${issue.row}` : ""}
                {issue.column ? ` · ${issue.column}` : ""}
              </code>{" "}
              {issue.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SheetRow({ sheet, counts, changes, expanded, onToggle }) {
  const total = ACTION_ORDER.reduce((sum, action) => sum + (counts[action] || 0), 0);
  return (
    <>
      <tr className="table-hover" style={{ cursor: "pointer" }} onClick={onToggle}>
        <td style={{ width: 28 }}>
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
        </td>
        <td><code>{sheet}</code></td>
        <td style={{ textAlign: "right", fontWeight: 700 }}>{total}</td>
        <td>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ACTION_ORDER.filter(action => counts[action]).map(action => (
              <span key={action} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <ActionTag action={action} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>{counts[action]}</span>
              </span>
            ))}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ background: "#fafafa", padding: 0 }}>
            <div style={{ maxHeight: 320, overflowY: "auto", padding: "8px 12px" }}>
              <table className="table" style={{ fontSize: 12 }}>
                <tbody>
                  {changes.map((change, index) => (
                    <tr key={index}>
                      <td style={{ width: 90 }}><ActionTag action={change.action} /></td>
                      <td style={{ fontWeight: 600 }}>{change.target}</td>
                      <td style={{ color: "#6b7280" }}>
                        {change.detail}
                        {change.diffs?.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {change.diffs.map((diff, position) => (
                              <div key={position} style={{ fontSize: 11 }}>
                                <code>{diff.field}</code>{" "}
                                <span style={{ color: "#b91c1c" }}>{String(diff.from ?? "—")}</span>
                                {" → "}
                                <span style={{ color: "#15803d" }}>{String(diff.to ?? "—")}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function BulkImport({ onOpenProject }) {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [expanded, setExpanded] = useState({});

  function pickFile(event) {
    setFile(event.target.files?.[0] || null);
    setReport(null);
    setCommitted(null);
    setFailure("");
  }

  async function send(mode) {
    if (!file) return;
    setBusy(true);
    setFailure("");
    const body = new FormData();
    body.append("file", file);
    body.append("mode", mode);
    if (mode === "commit") body.append("expected_sha256", report.file_sha256);

    try {
      const data = await apiUpload(ENDPOINT, body);
      setReport(data);
      if (mode === "commit") setCommitted(data);
    } catch (error) {
      const parsed = reportFrom(error);
      if (parsed) {
        // 422: the report is in the body and must render like any other —
        // that is where the errors to fix are.
        setReport(parsed);
        setCommitted(null);
      } else {
        setFailure(messageFrom(error));
      }
    } finally {
      setBusy(false);
    }
  }

  const errors = report?.errors || [];
  const warnings = report?.warnings || [];
  const summary = report?.summary || {};
  const changes = report?.changes || [];
  const canCommit = report && !committed && errors.length === 0 && !busy;

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-eyebrow">Module 1 · Bulk import</div>
        <h1 className="view-title">AS-IS workbook import</h1>
        <p className="view-lead">
          Upload an AS-IS workbook (13 sheets), read exactly what will change, then confirm.
          Nothing is written until you do — and a confirm is all-or-nothing.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">1 · Choose a workbook</div>
            <div className="card-sub">.xlsx · 5 MB maximum · the file is never stored on the server</div>
          </div>
        </div>
        <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".xlsx" onChange={pickFile} className="field-input" style={{ maxWidth: 420 }} />
          <button
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={() => send("validate")}
          >
            <Icon name="upload" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {busy ? "Working…" : "Validate"}
          </button>
          {file && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
          )}
        </div>
      </div>

      {failure && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "3px solid #dc2626" }}>
          <div className="card-body" style={{ color: "#b91c1c", fontSize: 13 }}>{failure}</div>
        </div>
      )}

      {report && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div>
                <div className="card-title">2 · Review the change report</div>
                <div className="card-sub">
                  Project <code>{report.project_ref}</code> ·{" "}
                  {report.project_exists
                    ? "an existing project will be updated"
                    : "a new project will be created"}
                  {" · "}sha256 <code>{report.file_sha256?.slice(0, 12)}</code>
                </div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Sheet</th>
                    <th style={{ textAlign: "right" }}>Rows</th>
                    <th>Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary).map(([sheet, counts]) => (
                    <SheetRow
                      key={sheet}
                      sheet={sheet}
                      counts={counts}
                      changes={changes.filter(change => change.sheet === sheet)}
                      expanded={!!expanded[sheet]}
                      onToggle={() => setExpanded(state => ({ ...state, [sheet]: !state[sheet] }))}
                    />
                  ))}
                </tbody>
              </table>
              {Object.keys(summary).length === 0 && (
                <div className="empty" style={{ padding: 24 }}>
                  <div className="empty-title">Nothing to change</div>
                </div>
              )}
            </div>
          </div>

          <IssueList
            title="Errors — these block the import"
            items={errors}
            tone={{ color: "#dc2626", icon: "circle-x" }}
          />
          <IssueList
            title="Warnings — reported, not blocking"
            items={warnings}
            tone={{ color: "#d97706", icon: "alert-triangle" }}
          />

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">3 · Confirm</div>
                <div className="card-sub">
                  {errors.length > 0
                    ? "Fix the errors above and validate again — confirming is disabled while any error stands."
                    : "The whole file is written in one transaction. Rows present in the tool but absent from the file are never deleted."}
                </div>
              </div>
            </div>
            <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                disabled={!canCommit}
                onClick={() => send("commit")}
              >
                {busy ? "Writing…" : "Confirm and import"}
              </button>
              {committed && (
                <span style={{ color: "#15803d", fontSize: 13, fontWeight: 600 }}>
                  <Icon name="check-circle" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  Imported.
                  {onOpenProject && committed.project_id && (
                    <button
                      className="btn btn-link"
                      style={{ marginLeft: 8 }}
                      onClick={() => onOpenProject(committed.project_id)}
                    >
                      Open the project
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
