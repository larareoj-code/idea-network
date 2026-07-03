import type { GraphData, GraphNode, Message } from "./types";

export type LayoutMode =
  | "force"
  | "clusterType"
  | "clusterSource"
  | "clusterThread"
  | "timeline"
  | "degree";

export interface SimNode {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface AnchorForce {
  (alpha: number): void;
  initialize?: (nodes: SimNode[]) => void;
}

const linkEndId = (v: unknown): string =>
  typeof v === "object" && v !== null ? (v as { id: string }).id : (v as string);

/** Spread group anchor points evenly on a circle. Single group sits at origin. */
export function groupAnchors(groups: string[], radius = 320): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const sorted = [...groups].sort();
  if (sorted.length === 1) {
    out.set(sorted[0], { x: 0, y: 0 });
    return out;
  }
  sorted.forEach((g, i) => {
    const a = (2 * Math.PI * i) / sorted.length;
    out.set(g, { x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  });
  return out;
}

/** Group key per node for the cluster layout modes. */
export function nodeGroups(
  mode: "clusterType" | "clusterSource" | "clusterThread",
  graph: GraphData,
  messages: Message[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (mode === "clusterType") {
    for (const n of graph.nodes) out.set(n.id, n.type);
    return out;
  }
  if (mode === "clusterSource") {
    const msgSource = new Map(messages.map((m) => [m.id, m.source]));
    for (const n of graph.nodes) {
      const ids =
        n.meta.kind === "person" || n.meta.kind === "thread" ? n.meta.messageIds : [];
      const counts = new Map<string, number>();
      for (const id of ids) {
        const s = msgSource.get(id);
        if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      let best = "other";
      let bestN = 0;
      for (const [s, c] of counts) if (c > bestN) ((best = s), (bestN = c));
      out.set(n.id, best);
    }
    // Concepts/SOPs inherit the dominant source of their linked threads.
    for (const n of graph.nodes) {
      if (n.meta.kind !== "concept" && n.meta.kind !== "sop") continue;
      const counts = new Map<string, number>();
      for (const tid of n.meta.threadIds) {
        const g = out.get(tid);
        if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
      }
      let best = "other";
      let bestN = 0;
      for (const [s, c] of counts) if (c > bestN) ((best = s), (bestN = c));
      out.set(n.id, best);
    }
    return out;
  }
  // clusterThread: each node grouped under its heaviest-linked thread.
  const isThread = new Set(graph.nodes.filter((n) => n.type === "thread").map((n) => n.id));
  const bestThread = new Map<string, { id: string; w: number }>();
  for (const l of graph.links) {
    const s = linkEndId(l.source);
    const t = linkEndId(l.target);
    const pairs: [string, string][] = [];
    if (isThread.has(t) && !isThread.has(s)) pairs.push([s, t]);
    if (isThread.has(s) && !isThread.has(t)) pairs.push([t, s]);
    for (const [node, thread] of pairs) {
      const cur = bestThread.get(node);
      if (!cur || l.weight > cur.w) bestThread.set(node, { id: thread, w: l.weight });
    }
  }
  for (const n of graph.nodes) {
    if (isThread.has(n.id)) out.set(n.id, n.id);
    else out.set(n.id, bestThread.get(n.id)?.id ?? "unlinked");
  }
  return out;
}

/** Epoch ms per node derived from message dates; nodes without dates are absent. */
export function nodeDates(graph: GraphData, messages: Message[]): Map<string, number> {
  const msgDate = new Map<string, number>();
  for (const m of messages) {
    if (!m.date) continue;
    const t = Date.parse(m.date);
    if (!Number.isNaN(t)) msgDate.set(m.id, t);
  }
  const out = new Map<string, number>();
  const min = (ids: string[]): number | null => {
    let best: number | null = null;
    for (const id of ids) {
      const t = msgDate.get(id);
      if (t !== undefined && (best === null || t < best)) best = t;
    }
    return best;
  };
  for (const n of graph.nodes) {
    if (n.meta.kind === "person" || n.meta.kind === "thread") {
      const t = min(n.meta.messageIds);
      if (t !== null) out.set(n.id, t);
    }
  }
  for (const n of graph.nodes) {
    if (n.meta.kind !== "concept" && n.meta.kind !== "sop") continue;
    let best: number | null = null;
    for (const tid of n.meta.threadIds) {
      const t = out.get(tid);
      if (t !== undefined && (best === null || t < best)) best = t;
    }
    if (best !== null) out.set(n.id, best);
  }
  return out;
}

/** Map node dates onto an x-axis span centered on 0. */
export function timelinePositions(dates: Map<string, number>, span = 900): Map<string, number> {
  const out = new Map<string, number>();
  if (dates.size === 0) return out;
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of dates.values()) {
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const range = hi - lo || 1;
  for (const [id, t] of dates) out.set(id, ((t - lo) / range - 0.5) * span);
  return out;
}

/** d3-force-compatible custom force pulling nodes toward per-node anchors. */
export function makeAnchorForce(
  anchor: (n: SimNode) => { x?: number; y?: number } | null,
  strength = 0.12,
): AnchorForce {
  let nodes: SimNode[] = [];
  const force: AnchorForce = (alpha: number) => {
    for (const n of nodes) {
      const a = anchor(n);
      if (!a) continue;
      if (a.x !== undefined) n.vx = (n.vx ?? 0) + (a.x - (n.x ?? 0)) * strength * alpha;
      if (a.y !== undefined) n.vy = (n.vy ?? 0) + (a.y - (n.y ?? 0)) * strength * alpha;
    }
  };
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

/** Pull high-degree nodes toward the origin, strength scaled by degree. */
export function makeDegreeForce(degrees: Map<string, number>, strength = 0.18): AnchorForce {
  let maxDeg = 1;
  for (const d of degrees.values()) if (d > maxDeg) maxDeg = d;
  let nodes: SimNode[] = [];
  const force: AnchorForce = (alpha: number) => {
    for (const n of nodes) {
      const w = (degrees.get(n.id) ?? 0) / maxDeg;
      n.vx = (n.vx ?? 0) - (n.x ?? 0) * w * strength * alpha;
      n.vy = (n.vy ?? 0) - (n.y ?? 0) * w * strength * alpha;
    }
  };
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

/** Simple pairwise collision force (radius per node), d3-force-compatible. */
export function makeCollideForce(
  radius: (n: SimNode) => number,
  strength = 0.7,
): AnchorForce {
  let nodes: SimNode[] = [];
  const force: AnchorForce = () => {
    if (strength <= 0) return;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ra = radius(a);
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const rb = radius(b);
        let dx = (b.x ?? 0) - (a.x ?? 0);
        let dy = (b.y ?? 0) - (a.y ?? 0);
        let d2 = dx * dx + dy * dy;
        const r = ra + rb;
        if (d2 >= r * r) continue;
        if (d2 === 0) {
          dx = (Math.random() - 0.5) * 1e-3;
          dy = (Math.random() - 0.5) * 1e-3;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const overlap = ((r - d) / d) * strength * 0.5;
        const wa = rb / r;
        const wb = ra / r;
        a.vx = (a.vx ?? 0) - dx * overlap * wa;
        a.vy = (a.vy ?? 0) - dy * overlap * wa;
        b.vx = (b.vx ?? 0) + dx * overlap * wb;
        b.vy = (b.vy ?? 0) + dy * overlap * wb;
      }
    }
  };
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

/** Build the extra layout force for a mode, or null for plain force-directed. */
export function buildLayoutForce(
  mode: LayoutMode,
  graph: GraphData,
  messages: Message[],
): AnchorForce | null {
  if (mode === "force") return null;
  if (mode === "degree") {
    const degrees = new Map(graph.nodes.map((n: GraphNode) => [n.id, n.degree]));
    return makeDegreeForce(degrees);
  }
  if (mode === "timeline") {
    const xs = timelinePositions(nodeDates(graph, messages));
    return makeAnchorForce((n) => {
      const x = xs.get(n.id);
      return x === undefined ? null : { x };
    });
  }
  const groups = nodeGroups(mode, graph, messages);
  const anchors = groupAnchors([...new Set(groups.values())]);
  return makeAnchorForce((n) => {
    const g = groups.get(n.id);
    return g ? (anchors.get(g) ?? null) : null;
  });
}

export function datasetHasDates(messages: Message[]): boolean {
  return messages.some((m) => !!m.date);
}
