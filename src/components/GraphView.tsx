import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ForceGraph from "force-graph";
import type { GraphData, GraphLink, GraphNode, Message, NodeType } from "../lib/types";
import { buildLayoutForce, makeCollideForce, type LayoutMode } from "../lib/graphForces";
import { DEFAULT_DENSITY, type DensitySettings } from "./GraphDensityControls";

export const NODE_COLORS: Record<NodeType, string> = {
  person: "#60a5fa",
  thread: "#fbbf24",
  concept: "#34d399",
  sop: "#f472b6",
};

const DIM_NODE = "rgba(90, 99, 117, 0.18)";
const LINK_ALPHA = 0.22;
const DIM_LINK_ALPHA = 0.06;
const HILITE_LINK_ALPHA = 0.55;
const MULTI_COLOR = "#22d3ee";
const PIN_COLOR = "#f59e0b";

interface RuntimeNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface RuntimeLink {
  source: string | RuntimeNode;
  target: string | RuntimeNode;
  type: GraphLink["type"];
  weight: number;
}

export interface MinimapData {
  nodes: { x: number; y: number; type: NodeType }[];
  viewport: { x: number; y: number; w: number; h: number };
}

export interface GraphViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  centerOn: (nodeId: string) => void;
  panTo: (x: number, y: number) => void;
  resetLayout: () => void;
  toggleFullscreen: () => void;
  getMinimapData: () => MinimapData | null;
}

interface Props {
  graph: GraphData;
  messages: Message[];
  selectedId: string | null;
  highlightIds: Set<string> | null;
  layoutMode: LayoutMode;
  density: DensitySettings;
  pinnedIds: Set<string>;
  multiSelectIds: Set<string>;
  onSelect: (id: string | null) => void;
  onIsolate: (id: string) => void;
  onToggleMultiSelect: (id: string) => void;
  onPin: (id: string) => void;
  onHide: (id: string) => void;
  onExpandNeighbors: (id: string) => void;
  children?: ReactNode;
}

const linkEnd = (v: string | RuntimeNode): string => (typeof v === "object" ? v.id : v);

// Above this node count, zoom-based labels are skipped so multi-thousand-node
// graphs don't pay per-frame text layout; explicit labels (hover/selected/
// search/keyboard focus) still render.
const LOD_NODE_THRESHOLD = 1500;

const GraphView = forwardRef<GraphViewHandle, Props>(function GraphView(
  {
    graph,
    messages,
    selectedId,
    highlightIds,
    layoutMode,
    density,
    pinnedIds,
    multiSelectIds,
    onSelect,
    onIsolate,
    onToggleMultiSelect,
    onPin,
    onHide,
    onExpandNeighbors,
    children,
  }: Props,
  ref,
) {
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph<RuntimeNode, RuntimeLink> | null>(null);
  const hoverRef = useRef<RuntimeNode | null>(null);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  const focusRef = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string; nodeLabel: string } | null>(null);

  // Interaction state lives in refs so canvas callbacks always see fresh values
  // without re-creating the graph instance.
  const stateRef = useRef({
    selectedId,
    highlightIds,
    neighbors: new Set<string>(),
    neighborList: [] as string[],
    nodeCount: 0,
    density: DEFAULT_DENSITY,
    pinnedIds: new Set<string>(),
    multiSelectIds: new Set<string>(),
  });

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

  const neighborList = useMemo(
    () => [...neighbors].filter((id) => id !== selectedId),
    [neighbors, selectedId],
  );

  stateRef.current = {
    selectedId,
    highlightIds,
    neighbors,
    neighborList,
    nodeCount: graph.nodes.length,
    density,
    pinnedIds,
    multiSelectIds,
  };

  const nodeRadius = (n: RuntimeNode) =>
    (2 + Math.sqrt(n.degree + 1) * 1.6) * stateRef.current.density.nodeScale;

  const requestRedraw = () => {
    const fg = graphRef.current;
    // Re-setting a paint prop flags needsRedraw — the render loop is paused
    // after cooldown, so ref changes alone never reach the canvas.
    if (fg) fg.nodeCanvasObject(fg.nodeCanvasObject());
  };

  useEffect(() => {
    focusRef.current = null;
  }, [selectedId, graph]);

  useEffect(() => {
    const isTextTarget = (el: Element | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.tagName === "BUTTON" ||
        el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Enter") return;
      if (isTextTarget(document.activeElement)) return;
      const { selectedId: sel, neighborList: list } = stateRef.current;
      if (!sel) return;
      if (e.key === "Enter") {
        if (focusRef.current) {
          e.preventDefault();
          onSelect(focusRef.current);
        }
        return;
      }
      if (list.length === 0) return;
      e.preventDefault();
      const idx = focusRef.current ? list.indexOf(focusRef.current) : -1;
      focusRef.current =
        e.key === "ArrowRight"
          ? list[(idx + 1) % list.length]
          : list[idx <= 0 ? list.length - 1 : idx - 1];
      requestRedraw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fg = new ForceGraph<RuntimeNode, RuntimeLink>(el)
      .backgroundColor("rgba(0,0,0,0)")
      .nodeId("id")
      .nodeVal((n) => 2 + Math.sqrt(n.degree + 1) * 1.6)
      .nodeLabel((n) => {
        const color = NODE_COLORS[n.type];
        let extra = "";
        if (n.meta.kind === "person") {
          extra = `<div class="tt-row">Sent <b>${n.meta.sentCount}</b> · Received <b>${n.meta.receivedCount}</b></div>`;
        } else if (n.meta.kind === "thread") {
          extra = `<div class="tt-row">Messages <b>${n.meta.messageIds.length}</b> · Participants <b>${n.meta.participantKeys.length}</b></div>`;
        } else if (n.meta.kind === "concept") {
          extra = `<div class="tt-row">Appears in <b>${n.meta.threadIds.length}</b> thread${n.meta.threadIds.length === 1 ? "" : "s"}</div>`;
        } else if (n.meta.kind === "sop") {
          extra = `<div class="tt-row">Referenced in <b>${n.meta.threadIds.length}</b> thread${n.meta.threadIds.length === 1 ? "" : "s"}</div>`;
        }
        return `<div class="node-tooltip"><div class="tt-header"><span class="tt-label">${n.fullLabel ?? n.label}</span><span class="tt-badge" style="background:${color}">${n.type}</span></div><div class="tt-row">Connections <b>${n.degree}</b></div>${extra}</div>`;
      })
      .linkVisibility(() => stateRef.current.density.showEdges)
      .linkColor((l) => {
        const { selectedId: sel, density: d } = stateRef.current;
        const base = (a: number) => `rgba(120, 132, 158, ${a * d.edgeOpacity})`;
        if (!sel) return base(LINK_ALPHA);
        const s = linkEnd(l.source);
        const t = linkEnd(l.target);
        return s === sel || t === sel
          ? `rgba(96, 165, 250, ${HILITE_LINK_ALPHA * d.edgeOpacity})`
          : base(DIM_LINK_ALPHA);
      })
      .linkWidth((l) =>
        Math.min(1 + Math.log2(l.weight), 4) * stateRef.current.density.linkWidthScale,
      )
      .nodeCanvasObject((node, ctx, globalScale) => {
        const {
          selectedId: sel,
          highlightIds: hilite,
          neighbors: nbrs,
          density: d,
          pinnedIds: pins,
          multiSelectIds: multi,
        } = stateRef.current;
        const r = nodeRadius(node);
        const x = node.x ?? 0;
        const y = node.y ?? 0;

        const dimmedBySelection = sel !== null && !nbrs.has(node.id);
        const dimmedBySearch = hilite !== null && !hilite.has(node.id);
        const dimmed = (dimmedBySelection || dimmedBySearch) && !multi.has(node.id);
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

        if (multi.has(node.id)) {
          ctx.beginPath();
          ctx.arc(x, y, r + 2.5 / globalScale, 0, 2 * Math.PI);
          ctx.lineWidth = 1.5 / globalScale;
          ctx.strokeStyle = MULTI_COLOR;
          ctx.stroke();
        }

        if (pins.has(node.id)) {
          ctx.beginPath();
          ctx.arc(x + r * 0.85, y - r * 0.85, Math.max(r * 0.3, 1.6 / globalScale), 0, 2 * Math.PI);
          ctx.fillStyle = PIN_COLOR;
          ctx.fill();
        }

        const focused = focusRef.current === node.id && node.id !== sel;
        if (focused) {
          ctx.setLineDash([3 / globalScale, 2 / globalScale]);
          ctx.lineWidth = 1.5 / globalScale;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const hovered = hoverRef.current?.id === node.id;
        const searchHit = hilite !== null && hilite.has(node.id);
        const lod = stateRef.current.nodeCount > LOD_NODE_THRESHOLD;
        const explicit = hovered || node.id === sel || searchHit || focused || multi.has(node.id);
        let showLabel: boolean;
        switch (d.labelMode) {
          case "always":
            showLabel = !dimmed;
            break;
          case "hover":
            showLabel = hovered;
            break;
          case "selected":
            showLabel = node.id === sel || multi.has(node.id);
            break;
          default:
            showLabel =
              !dimmed &&
              (explicit ||
                (!lod &&
                  (globalScale > d.labelZoom ||
                    (globalScale > d.labelZoom * 0.55 && node.degree >= 8))));
        }
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
        const r = nodeRadius(node) + 2;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      })
      .onNodeHover((node) => {
        hoverRef.current = node ?? null;
        el.style.cursor = node ? "pointer" : "default";
      })
      .onNodeClick((node, event) => {
        if (event.shiftKey) {
          onToggleMultiSelect(node.id);
          return;
        }
        const now = performance.now();
        const last = lastClickRef.current;
        lastClickRef.current = { id: node.id, time: now };
        if (last.id === node.id && now - last.time < 350) {
          if (stateRef.current.pinnedIds.has(node.id)) {
            onPin(node.id);
          } else {
            onIsolate(node.id);
          }
        } else {
          onSelect(node.id);
        }
      })
      .onNodeRightClick((node, event) => {
        event.preventDefault();
        const rect = el.getBoundingClientRect();
        setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, nodeId: node.id, nodeLabel: node.fullLabel ?? node.label });
      })
      .onNodeDragEnd((node) => {
        // force-graph releases fx/fy on drag end (verified in source) —
        // re-fixing here makes drag an explicit pin action.
        node.fx = node.x;
        node.fy = node.y;
        if (!stateRef.current.pinnedIds.has(node.id)) onPin(node.id);
      })
      .onBackgroundClick(() => onSelect(null))
      .cooldownTicks(200);

    const charge = fg.d3Force("charge") as { strength?: (v: number) => void } | undefined;
    charge?.strength?.(-42);

    graphRef.current = fg;

    el.addEventListener("contextmenu", (e) => e.preventDefault());

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

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    // null deletes the force from the simulation (d3-force forces.delete) —
    // overwriting alone would leave stale layout forces active across modes.
    fg.d3Force("layout", null);
    const force = buildLayoutForce(layoutMode, graph, messages);
    if (force) fg.d3Force("layout", force as never);
    fg.d3ReheatSimulation();
  }, [layoutMode, graph, messages]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const link = fg.d3Force("link") as { distance?: (v: number) => void } | undefined;
    link?.distance?.(density.linkDistance);
    fg.d3Force(
      "collide",
      density.collideStrength > 0
        ? (makeCollideForce((n) => nodeRadius(n as RuntimeNode) + 1, density.collideStrength) as never)
        : null,
    );
    fg.d3ReheatSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density.linkDistance, density.collideStrength]);

  useEffect(() => {
    requestRedraw();
  }, [
    density.nodeScale,
    density.labelZoom,
    density.labelMode,
    density.edgeOpacity,
    density.linkWidthScale,
    density.showEdges,
    multiSelectIds,
    pinnedIds,
  ]);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    let changed = false;
    for (const n of fg.graphData().nodes) {
      const pinned = pinnedIds.has(n.id);
      if (pinned && n.fx === undefined) {
        n.fx = n.x;
        n.fy = n.y;
        changed = true;
      } else if (!pinned && n.fx !== undefined) {
        n.fx = undefined;
        n.fy = undefined;
        changed = true;
      }
    }
    if (changed) fg.d3ReheatSimulation();
  }, [pinnedIds, graph]);

  useImperativeHandle(
    ref,
    (): GraphViewHandle => ({
      zoomIn: () => {
        const fg = graphRef.current;
        if (fg) fg.zoom(fg.zoom() * 1.4, 300);
      },
      zoomOut: () => {
        const fg = graphRef.current;
        if (fg) fg.zoom(fg.zoom() / 1.4, 300);
      },
      fitToScreen: () => graphRef.current?.zoomToFit(400, 40),
      centerOn: (nodeId: string) => {
        const fg = graphRef.current;
        if (!fg) return;
        const node = fg.graphData().nodes.find((n) => n.id === nodeId);
        if (node?.x === undefined || node.y === undefined) return;
        fg.centerAt(node.x, node.y, 400);
      },
      panTo: (x: number, y: number) => graphRef.current?.centerAt(x, y, 200),
      resetLayout: () => {
        const fg = graphRef.current;
        if (!fg) return;
        const nodes = fg.graphData().nodes;
        const spread = Math.sqrt(nodes.length + 1) * 12;
        for (const n of nodes) {
          n.fx = undefined;
          n.fy = undefined;
          n.x = (Math.random() - 0.5) * spread;
          n.y = (Math.random() - 0.5) * spread;
          n.vx = 0;
          n.vy = 0;
        }
        fg.d3ReheatSimulation();
      },
      toggleFullscreen: () => {
        const el = shellRef.current;
        if (!el) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen();
      },
      getMinimapData: () => {
        const fg = graphRef.current;
        const el = containerRef.current;
        if (!fg || !el) return null;
        const tl = fg.screen2GraphCoords(0, 0);
        const br = fg.screen2GraphCoords(el.clientWidth, el.clientHeight);
        return {
          nodes: fg
            .graphData()
            .nodes.filter((n) => n.x !== undefined)
            .map((n) => ({ x: n.x!, y: n.y!, type: n.type })),
          viewport: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y },
        };
      },
    }),
    [],
  );

  const menuNodePinned = menu ? pinnedIds.has(menu.nodeId) : false;

  return (
    // force-graph wipes its container's DOM on init (domNode.innerHTML = ''),
    // so React children must live in a sibling-wrapping shell, never inside it.
    <div ref={shellRef} className="graph-shell" onClick={(e) => e.stopPropagation()}>
      <div ref={containerRef} className="graph-wrap" />
      {children}
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onSelect(menu.nodeId);
              setMenu(null);
            }}
          >
            Select
          </button>
          <button
            onClick={() => {
              onIsolate(menu.nodeId);
              setMenu(null);
            }}
          >
            Isolate neighborhood
          </button>
          <button
            onClick={() => {
              onPin(menu.nodeId);
              setMenu(null);
            }}
          >
            {menuNodePinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => {
              onHide(menu.nodeId);
              setMenu(null);
            }}
          >
            Hide node
          </button>
          <button
            onClick={() => {
              onExpandNeighbors(menu.nodeId);
              setMenu(null);
            }}
          >
            Expand neighbors
          </button>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(menu.nodeLabel);
              setMenu(null);
            }}
          >
            Copy label
          </button>
        </div>
      )}
    </div>
  );
});

export default GraphView;
