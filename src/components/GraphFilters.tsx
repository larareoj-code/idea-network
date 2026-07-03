import type { GraphLink, GraphNode, NodeType } from "../lib/types";

const endId = (v: unknown): string =>
  typeof v === "object" && v !== null ? (v as { id: string }).id : (v as string);

export function connectedComponents(nodes: GraphNode[], links: GraphLink[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (c !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const n of nodes) parent.set(n.id, n.id);
  for (const l of links) {
    const s = endId(l.source);
    const t = endId(l.target);
    if (!parent.has(s) || !parent.has(t)) continue;
    parent.set(find(s), find(t));
  }
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const r = find(n.id);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(n.id);
  }
  return [...groups.values()];
}

/** Ids of every node NOT in the single largest connected component. */
export function nonLargestComponentIds(nodes: GraphNode[], links: GraphLink[]): Set<string> {
  const comps = connectedComponents(nodes, links);
  if (comps.length <= 1) return new Set();
  let largest = 0;
  for (let i = 1; i < comps.length; i++) if (comps[i].length > comps[largest].length) largest = i;
  const ids = new Set<string>();
  for (let i = 0; i < comps.length; i++) {
    if (i === largest) continue;
    for (const id of comps[i]) ids.add(id);
  }
  return ids;
}

interface Props {
  neighborhoodOnly: boolean;
  onToggleNeighborhood: () => void;
  highDegreeOnly: boolean;
  onToggleHighDegree: () => void;
  degreeThreshold: number;
  onDegreeThreshold: (n: number) => void;
  isolatedClusters: boolean;
  onToggleIsolatedClusters: () => void;
  hideLowConnection: boolean;
  onToggleHideLowConnection: () => void;
  selectedType: NodeType | null;
  onHideSelectedType: () => void;
}

export default function GraphFilters(props: Props) {
  return (
    <div className="graph-filters">
      <button
        className={`chip ${props.neighborhoodOnly ? "active" : ""}`}
        onClick={props.onToggleNeighborhood}
        title="Restrict the graph to the selected node and its direct neighbors, following the selection as it changes"
      >
        Neighborhood only
      </button>
      <button
        className={`chip ${props.highDegreeOnly ? "active" : ""}`}
        onClick={props.onToggleHighDegree}
        title="Only show nodes at or above the degree threshold"
      >
        High-degree only
      </button>
      {props.highDegreeOnly && (
        <input
          className="chip-num"
          type="number"
          min={1}
          value={props.degreeThreshold}
          onChange={(e) => props.onDegreeThreshold(Math.max(1, Number(e.target.value) || 1))}
          title="Degree threshold"
        />
      )}
      <button
        className={`chip ${props.isolatedClusters ? "active" : ""}`}
        onClick={props.onToggleIsolatedClusters}
        title="Show only components disconnected from the largest cluster"
      >
        Isolated clusters
      </button>
      <button
        className={`chip ${props.hideLowConnection ? "active" : ""}`}
        onClick={props.onToggleHideLowConnection}
        title="Hide nodes with one or zero connections"
      >
        Hide low-connection
      </button>
      <button
        className="chip"
        onClick={props.onHideSelectedType}
        disabled={!props.selectedType}
        title="Hide the type of the currently selected node"
      >
        {props.selectedType ? `Hide ${props.selectedType}s` : "Hide selected type"}
      </button>
    </div>
  );
}
