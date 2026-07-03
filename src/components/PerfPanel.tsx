import { useState, useEffect } from "react";
import { getPerfMarks, clearPerfMarks, type PerfMark } from "../lib/perf";

interface Props {
  nodeCount: number;
  edgeCount: number;
  filteredNodeCount: number;
  filteredEdgeCount: number;
  onClose: () => void;
}

export function PerfPanel({ nodeCount, edgeCount, filteredNodeCount, filteredEdgeCount, onClose }: Props) {
  const [marks, setMarks] = useState<PerfMark[]>([]);

  useEffect(() => {
    const id = setInterval(() => setMarks(getPerfMarks()), 1000);
    return () => clearInterval(id);
  }, []);

  const completed = marks.filter((m) => m.durationMs !== undefined);

  return (
    <div className="perf-panel">
      <div className="perf-panel__header">
        <span>Performance Diagnostics</span>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="perf-panel__section">
        <div className="perf-panel__row">
          <span>Total nodes</span><span>{nodeCount.toLocaleString()}</span>
        </div>
        <div className="perf-panel__row">
          <span>Visible nodes</span><span>{filteredNodeCount.toLocaleString()}</span>
        </div>
        <div className="perf-panel__row">
          <span>Total edges</span><span>{edgeCount.toLocaleString()}</span>
        </div>
        <div className="perf-panel__row">
          <span>Visible edges</span><span>{filteredEdgeCount.toLocaleString()}</span>
        </div>
      </div>
      {completed.length > 0 && (
        <div className="perf-panel__section">
          <div className="perf-panel__label">Timings</div>
          {completed.map((m, i) => (
            <div key={i} className="perf-panel__row">
              <span>{m.label}</span>
              <span className={m.durationMs! > 500 ? "perf-panel__slow" : ""}>{m.durationMs!.toFixed(1)}ms</span>
            </div>
          ))}
          <button className="perf-panel__clear" onClick={clearPerfMarks}>Clear</button>
        </div>
      )}
    </div>
  );
}
