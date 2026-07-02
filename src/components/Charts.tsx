import { useMemo, useState } from "react";
import type { Dataset } from "../lib/types";
import { buildChart, CHART_METRICS, type ChartMetric, type ChartSpec } from "../lib/charts";

export function Chart({ spec, onPick }: { spec: ChartSpec; onPick?: (nodeId: string) => void }) {
  if (spec.data.length === 0) {
    return <div className="chart-empty">No data for this chart.</div>;
  }
  return spec.kind === "donut" ? <Donut spec={spec} /> : <Bars spec={spec} onPick={onPick} />;
}

function Bars({ spec, onPick }: { spec: ChartSpec; onPick?: (nodeId: string) => void }) {
  const max = Math.max(...spec.data.map((d) => d.value));
  return (
    <div className="chart">
      <div className="chart-title">{spec.title}</div>
      <div className="bars">
        {spec.data.map((d, i) => (
          <div
            key={i}
            className={`bar-row ${d.nodeId && onPick ? "clickable" : ""}`}
            onClick={() => d.nodeId && onPick?.(d.nodeId)}
            title={d.label}
          >
            <span className="bar-label">{d.label}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? "var(--accent)" }}
              />
            </span>
            <span className="bar-value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Donut({ spec }: { spec: ChartSpec }) {
  const total = spec.data.reduce((s, d) => s + d.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segments = spec.data
    .filter((d) => d.value > 0)
    .map((d) => {
      const frac = d.value / total;
      const seg = { ...d, dash: frac * C, offset };
      offset += frac * C;
      return seg;
    });
  return (
    <div className="chart">
      <div className="chart-title">{spec.title}</div>
      <div className="donut-wrap">
        <svg viewBox="0 0 140 140" className="donut">
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={s.color ?? "var(--accent)"}
              strokeWidth="18"
              strokeDasharray={`${s.dash} ${C - s.dash}`}
              strokeDashoffset={-s.offset}
              transform="rotate(-90 70 70)"
            />
          ))}
          <text x="70" y="66" textAnchor="middle" className="donut-total">
            {total}
          </text>
          <text x="70" y="82" textAnchor="middle" className="donut-caption">
            nodes
          </text>
        </svg>
        <div className="donut-legend">
          {spec.data.map((d, i) => (
            <div key={i} className="legend-row">
              <span className="swatch" style={{ background: d.color ?? "var(--accent)" }} />
              {d.label}
              <span className="count">
                {d.value} ({total ? Math.round((d.value / total) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PanelProps {
  dataset: Dataset;
  onPick: (nodeId: string) => void;
  onClose: () => void;
}

export function ChartsPanel({ dataset, onPick, onClose }: PanelProps) {
  const [metric, setMetric] = useState<ChartMetric>("top-senders");
  const [topN, setTopN] = useState(10);
  const spec = useMemo(() => buildChart(dataset, metric, topN), [dataset, metric, topN]);

  return (
    <>
      <div className="detail-header">
        <div>
          <h2>Charts</h2>
          <div className="sub">Click a bar to jump to that node</div>
        </div>
        <button className="detail-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>
      <div className="detail-body">
        <div className="chart-controls">
          <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as ChartMetric)}>
            {CHART_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <select className="select narrow" value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            {[5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </div>
        <Chart spec={spec} onPick={onPick} />
      </div>
    </>
  );
}
