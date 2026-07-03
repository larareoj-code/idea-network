import { useEffect, useRef, useState } from "react";
import type { ImportSummary } from "../lib/importSummary";

const SKIP_KEY = "idea-network:skip-import-review";

interface Props {
  summary: ImportSummary;
  onConfirm: () => void;
  onCancel: () => void;
}

export function shouldSkipReview(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "true";
  } catch {
    return false;
  }
}

export default function ImportReviewPanel({ summary, onConfirm, onCancel }: Props) {
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [skipFuture, setSkipFuture] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    if (skipFuture) {
      try {
        localStorage.setItem(SKIP_KEY, "true");
      } catch {
        // storage blocked
      }
    }
    onConfirm();
  };

  const anyExternalDomains = summary.files.some((f) => f.externalDomains.length > 0);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import review">
      <div className="modal-panel import-review">
        <div className="modal-header">
          <h2>Review Import</h2>
          <button className="detail-close" onClick={onCancel} aria-label="Cancel import">✕</button>
        </div>

        <div className="modal-body">
          {/* Per-file table */}
          <table className="import-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Messages</th>
                <th>Skipped</th>
                <th>Date range</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {summary.files.map((f) => (
                <tr key={f.name}>
                  <td className="import-file-name" title={f.name}>{f.name}</td>
                  <td>{f.messageCount}</td>
                  <td>{f.skippedCount > 0 ? f.skippedCount : "—"}</td>
                  <td className="import-date-range">
                    {f.dateRange.earliest
                      ? `${f.dateRange.earliest} → ${f.dateRange.latest}`
                      : <span className="text-faint">unknown</span>}
                  </td>
                  <td>
                    <div className="badge-row">
                      {f.warnings.map((w, i) => (
                        <span key={i} className="badge warn">{w}</span>
                      ))}
                      {f.externalDomains.length > 0 && (
                        <span className="badge danger" title={f.externalDomains.join(", ")}>
                          {f.externalDomains.length} external domain{f.externalDomains.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="import-totals">
            <div className="kv"><span>Total messages in graph</span><b>{summary.totalMessages}</b></div>
            <div className="kv"><span>Nodes</span><b>{summary.totalNodes}</b></div>
            <div className="kv"><span>Edges</span><b>{summary.totalEdges}</b></div>
            {summary.dedupeCount > 0 && (
              <div className="kv">
                <span>Duplicate messages dropped</span>
                <b className="text-warn">{summary.dedupeCount}</b>
              </div>
            )}
          </div>

          {/* External domain details */}
          {anyExternalDomains && (
            <div className="import-alert danger">
              <strong>External domains detected</strong>
              <ul>
                {summary.files.flatMap((f) =>
                  f.externalDomains.map((d) => (
                    <li key={`${f.name}:${d}`}>{d} <span className="text-faint">(from {f.name})</span></li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* Parse errors */}
          {summary.parseErrors.length > 0 && (
            <div className="import-alert danger">
              <button
                className="import-collapsible"
                onClick={() => setErrorsOpen((v) => !v)}
                aria-expanded={errorsOpen}
              >
                {errorsOpen ? "▾" : "▸"} {summary.parseErrors.length} parse error{summary.parseErrors.length === 1 ? "" : "s"}
              </button>
              {errorsOpen && (
                <ul>
                  {summary.parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Skip checkbox */}
          <label className="import-skip-label">
            <input
              type="checkbox"
              checked={skipFuture}
              onChange={(e) => setSkipFuture(e.target.checked)}
            />
            Always skip review for future imports
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" ref={confirmRef} onClick={handleConfirm}>
            Confirm &amp; Build Graph
          </button>
        </div>
      </div>
    </div>
  );
}
