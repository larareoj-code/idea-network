import type { LinkType } from "../lib/types";

export type LabelMode = "auto" | "always" | "hover" | "selected";

export interface DensitySettings {
  nodeScale: number;
  labelZoom: number;
  labelMode: LabelMode;
  edgeOpacity: number;
  linkDistance: number;
  collideStrength: number;
  linkWidthScale: number;
  showEdges: boolean;
  minLinkWeight: number;
}

export const DEFAULT_DENSITY: DensitySettings = {
  nodeScale: 1,
  labelZoom: 2.2,
  labelMode: "auto",
  edgeOpacity: 1,
  linkDistance: 30,
  collideStrength: 0,
  linkWidthScale: 1,
  showEdges: true,
  minLinkWeight: 0,
};

const APP_LINK_TYPES: Exclude<LinkType, "cooccurs">[] = ["participated", "mentions", "references"];

interface Props {
  settings: DensitySettings;
  onChange: (next: DensitySettings) => void;
  enabledLinkTypes: Set<Exclude<LinkType, "cooccurs">>;
  onToggleLinkType: (t: Exclude<LinkType, "cooccurs">) => void;
  maxLinkWeight: number;
}

export default function GraphDensityControls({
  settings,
  onChange,
  enabledLinkTypes,
  onToggleLinkType,
  maxLinkWeight,
}: Props) {
  const set = (patch: Partial<DensitySettings>) => onChange({ ...settings, ...patch });

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    apply: (v: number) => void,
  ) => (
    <label className="density-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => apply(Number(e.target.value))}
      />
      <span className="density-val">{value}</span>
    </label>
  );

  return (
    <div className="graph-panel">
      <div className="graph-panel-title">Density</div>
      {slider("Node size", settings.nodeScale, 0.3, 3, 0.1, (v) => set({ nodeScale: v }))}
      {slider("Label zoom", settings.labelZoom, 0.5, 6, 0.1, (v) => set({ labelZoom: v }))}
      {slider("Link distance", settings.linkDistance, 5, 200, 5, (v) => set({ linkDistance: v }))}
      {slider("Collision", settings.collideStrength, 0, 1, 0.05, (v) => set({ collideStrength: v }))}
      <label className="density-row">
        <span>Labels</span>
        <select
          value={settings.labelMode}
          onChange={(e) => set({ labelMode: e.target.value as LabelMode })}
        >
          <option value="auto">Auto</option>
          <option value="always">Always</option>
          <option value="hover">Hover only</option>
          <option value="selected">Selected only</option>
        </select>
      </label>

      <div className="graph-panel-title">Edges</div>
      <label className="density-row">
        <span>Show edges</span>
        <input
          type="checkbox"
          checked={settings.showEdges}
          onChange={(e) => set({ showEdges: e.target.checked })}
        />
      </label>
      {slider("Opacity", settings.edgeOpacity, 0, 1, 0.05, (v) => set({ edgeOpacity: v }))}
      {slider("Thickness", settings.linkWidthScale, 0.2, 4, 0.1, (v) => set({ linkWidthScale: v }))}
      {slider("Min weight", settings.minLinkWeight, 0, Math.max(1, maxLinkWeight), 1, (v) =>
        set({ minLinkWeight: v }),
      )}
      <div className="density-linktypes">
        {APP_LINK_TYPES.map((t) => (
          <button
            key={t}
            className={`layout-mode-btn ${enabledLinkTypes.has(t) ? "active" : ""}`}
            onClick={() => onToggleLinkType(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
