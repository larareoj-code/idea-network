import { useEffect, useMemo, useRef } from "react";
import ForceGraph from "force-graph";
import type { GraphData, GraphLink, GraphNode, NodeType } from "../lib/types";

export const NODE_COLORS: Record<NodeType, string> = {
  person: "#60a5fa",
  thread: "#fbbf24",
  concept: "#34d399",
  sop: "#f472b6",
};

const DIM_NODE = "rgba(90, 99, 117, 0.18)";
const DIM_LINK = "rgba(90, 99, 117, 0.06)";
const LINK_COLOR = "rgba(120, 132, 158, 0.22)";
const HILITE_LINK = "rgba(96, 165, 250, 0.55)";

interface RuntimeNode extends GraphNode {
  x?: number;
  y?: number;
}

interface RuntimeLink {
  source: string | RuntimeNode;
  target: string | RuntimeNode;
  type: GraphLink["type"];
  weight: number;
}

interface Props {
  graph: GraphData;
  selectedId: string | null;
  highlightIds: Set<string> | null;
  onSelect: (id: string | null) => void;
  onIsolate: (id: string) => void;
}

const linkEnd = (v: string | RuntimeNode): string => (typeof v === "object" ? v.id : v);

export default function GraphView({ graph, selectedId, highlightIds, onSelect, onIsolate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph<RuntimeNode, RuntimeLink> | null>(null);
  const hoverRef = useRef<RuntimeNode | null>(null);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });

  // Interaction state lives in refs so canvas callbacks always see fresh values
  // without re-creating the graph instance.
  const stateRef = useRef({ selectedId, highlightIds, neighbors: new Set<string>() });

  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    set.add(selectedId);
    for (const l of graph.links) {
      const s = linkEnd(l.source as string | RuntimeNode);
      const t = linkEnd(l.target as string | RuntimeNode);
      if (s === selectedId) set.add(t);
      if (t === selectedId) set.add(s);
    }
    return set;
  }, [graph, selectedId]);

  stateRef.current = { selectedId, highlightIds, neighbors };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fg = new ForceGraph<RuntimeNode, RuntimeLink>(el)
      .backgroundColor("rgba(0,0,0,0)")
      .nodeId("id")
      .nodeVal((n) => 2 + Math.sqrt(n.degree + 1) * 1.6)
      .nodeLabel((n) => `${n.fullLabel ?? n.label} (${n.type})`)
      .linkColor((l) => {
        const { selectedId: sel } = stateRef.current;
        if (!sel) return LINK_COLOR;
        const s = linkEnd(l.source);
        const t = linkEnd(l.target);
        return s === sel || t === sel ? HILITE_LINK : DIM_LINK;
      })
      .linkWidth((l) => Math.min(1 + Math.log2(l.weight), 4))
      .nodeCanvasObject((node, ctx, globalScale) => {
        const { selectedId: sel, highlightIds: hilite, neighbors: nbrs } = stateRef.current;
        const r = 2 + Math.sqrt(node.degree + 1) * 1.6;
        const x = node.x ?? 0;
        const y = node.y ?? 0;

        const dimmedBySelection = sel !== null && !nbrs.has(node.id);
        const dimmedBySearch = hilite !== null && !hilite.has(node.id);
        const dimmed = dimmedBySelection || dimmedBySearch;
        const color = dimmed ? DIM_NODE : NODE_COLORS[node.type];

        ctx.beginPath();
        if (node.type === "sop") {
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r, y);
          ctx.closePath();
        } else {
          ctx.arc(x, y, r, 0, 2 * Math.PI);
        }
        ctx.fillStyle = color;
        ctx.fill();

        if (node.id === sel) {
          ctx.lineWidth = 1.5 / globalScale;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
        }

        const hovered = hoverRef.current?.id === node.id;
        const searchHit = hilite !== null && hilite.has(node.id);
        const showLabel =
          !dimmed && (hovered || node.id === sel || searchHit || globalScale > 2.2 || (globalScale > 1.2 && node.degree >= 8));
        if (showLabel) {
          const fontSize = Math.max(11 / globalScale, 2.2);
          ctx.font = `${hovered || node.id === sel ? 600 : 400} ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = dimmed ? DIM_NODE : "#c9d1e0";
          ctx.fillText(node.label, x, y + r + 2 / globalScale);
        }
      })
      .nodePointerAreaPaint((node, color, ctx) => {
        const r = 4 + Math.sqrt(node.degree + 1) * 1.6;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      })
      .onNodeHover((node) => {
        hoverRef.current = node ?? null;
        el.style.cursor = node ? "pointer" : "default";
      })
      .onNodeClick((node) => {
        const now = performance.now();
        const last = lastClickRef.current;
        lastClickRef.current = { id: node.id, time: now };
        if (last.id === node.id && now - last.time < 350) {
          onIsolate(node.id);
        } else {
          onSelect(node.id);
        }
      })
      .onBackgroundClick(() => onSelect(null))
      .cooldownTicks(200);

    const charge = fg.d3Force("charge") as { strength?: (v: number) => void } | undefined;
    charge?.strength?.(-42);

    graphRef.current = fg;

    const resize = () => fg.width(el.clientWidth).height(el.clientHeight);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    return () => {
      observer.disconnect();
      fg._destructor();
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    // Clone: force-graph mutates node/link objects (positions, object refs).
    const nodes: RuntimeNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: RuntimeLink[] = graph.links.map((l) => ({
      source: linkEnd(l.source as string | RuntimeNode),
      target: linkEnd(l.target as string | RuntimeNode),
      type: l.type,
      weight: l.weight,
    }));
    fg.graphData({ nodes, links });
    fg.d3ReheatSimulation();
  }, [graph]);

  return <div ref={containerRef} className="graph-wrap" onClick={(e) => e.stopPropagation()} />;
}
