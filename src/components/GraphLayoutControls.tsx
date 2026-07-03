import type { LayoutMode } from "../lib/graphForces";

interface Props {
  mode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  hasDates: boolean;
}

const MODES: { id: LayoutMode; label: string }[] = [
  { id: "force", label: "Force-directed" },
  { id: "clusterType", label: "Cluster by type" },
  { id: "clusterSource", label: "Cluster by source" },
  { id: "clusterThread", label: "Cluster by thread" },
  { id: "timeline", label: "Timeline" },
  { id: "degree", label: "Degree-weighted" },
];

export default function GraphLayoutControls({ mode, onChange, hasDates }: Props) {
  return (
    <div className="graph-panel">
      <div className="graph-panel-title">Layout</div>
      <div className="layout-modes">
        {MODES.filter((m) => m.id !== "timeline" || hasDates).map((m) => (
          <button
            key={m.id}
            className={`layout-mode-btn ${mode === m.id ? "active" : ""}`}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
