import { GRAPH_MODE_ORDER, GRAPH_MODES, type GraphMode } from "../lib/graphModes";

interface Props {
  activeMode: GraphMode | null;
  hasDates: boolean;
  onSelect: (mode: GraphMode) => void;
}

export default function GraphModeBar({ activeMode, hasDates, onSelect }: Props) {
  return (
    <div className="graph-panel">
      <div className="graph-panel-title">
        Graph mode
        {activeMode && activeMode !== "overview" && (
          <button
            className="graph-mode-reset"
            onClick={() => onSelect("overview")}
            title="Reset to Overview"
          >
            ×
          </button>
        )}
      </div>
      <div className="graph-mode-grid">
        {GRAPH_MODE_ORDER.map((m) => {
          const cfg = GRAPH_MODES[m];
          const disabled = m === "timeline" && !hasDates;
          return (
            <button
              key={m}
              className={`graph-mode-btn${activeMode === m ? " active" : ""}${disabled ? " disabled" : ""}`}
              title={cfg.description + (disabled ? " — requires dated messages (PST/MSG/EML)" : "")}
              onClick={() => !disabled && onSelect(m)}
              disabled={disabled}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
