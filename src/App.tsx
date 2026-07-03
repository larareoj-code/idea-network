import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, GraphData, GraphNode, LinkType, Message, NodeType } from "./lib/types";
import { parseOutlookCsv } from "./lib/parseOutlookCsv";
import { parseFiles, type ParseProgress } from "./lib/ingest";
import { exportDatasetJson, importDatasetJson, mergeDataset } from "./lib/dataset";
import { clearDataset, loadDataset, saveDataset } from "./lib/storage";
import { runQuery } from "./lib/query";
import GraphView, { type GraphViewHandle } from "./components/GraphView";
import GraphControls from "./components/GraphControls";
import GraphLayoutControls from "./components/GraphLayoutControls";
import GraphDensityControls, {
  DEFAULT_DENSITY,
  type DensitySettings,
} from "./components/GraphDensityControls";
import { datasetHasDates, type LayoutMode } from "./lib/graphForces";
import Sidebar, { ALL_TYPES, type ViewState } from "./components/Sidebar";
import type { SavedView } from "./lib/savedViews";
import DetailPanel from "./components/DetailPanel";
import StatsBar from "./components/StatsBar";
import { DropOverlay, EmptyState } from "./components/UploadZone";
import { ChartsPanel } from "./components/Charts";
import AskPanel from "./components/AskPanel";
import CommandPalette, { type PaletteAction } from "./components/CommandPalette";

const SAMPLES = [
  { url: "samples/inbox.csv", name: "inbox.csv" },
  { url: "samples/sent.csv", name: "sent.csv" },
];

type Panel = "details" | "charts" | "ask" | null;

const linkEndId = (v: unknown): string =>
  typeof v === "object" && v !== null ? (v as { id: string }).id : (v as string);

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hideNonMatching, setHideNonMatching] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeType>>(new Set(ALL_TYPES));
  const [showPersonLinks, setShowPersonLinks] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [densitySettings, setDensitySettings] = useState<DensitySettings>(DEFAULT_DENSITY);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [enabledLinkTypes, setEnabledLinkTypes] = useState<Set<Exclude<LinkType, "cooccurs">>>(
    new Set(["participated", "mentions", "references"]),
  );
  const graphApi = useRef<GraphViewHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDataset().then((d) => {
      if (cancelled) return;
      // Never clobber data the user uploaded while the load was in flight.
      if (d) setDataset((prev) => prev ?? d);
      setBooting(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dataset) void saveDataset(dataset);
  }, [dataset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape" && !paletteOpen) {
        setPanel(null);
        setSelectedId(null);
        setIsolatedId(null);
        setMultiSelectIds(new Set());
        setExpandedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  const applyDataset = useCallback((next: Dataset | null) => {
    setDataset(next);
    setSelectedId(null);
    setIsolatedId(null);
    setPanel(null);
  }, []);

  const ingestItems = useCallback(
    (items: { name: string; messages: Message[] }[]) => {
      if (items.length === 0) return;
      // Functional update: overlapping async uploads must merge into the
      // latest dataset, not the one captured when parsing started.
      setDataset((prev) => {
        let next = prev;
        for (const item of items) next = mergeDataset(next, item.messages, item.name);
        return next;
      });
      setSelectedId(null);
      setIsolatedId(null);
      setPanel(null);
    },
    [],
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      setError(null);
      setParseProgress(null);
      try {
        const { items, errors } = await parseFiles(files, setParseProgress);
        ingestItems(items);
        if (errors.length) setError(errors.join(" · "));
      } finally {
        setLoading(false);
        setParseProgress(null);
      }
    },
    [ingestItems],
  );

  const onLoadSamples = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await Promise.all(
        SAMPLES.map(async (s) => {
          const res = await fetch(`${import.meta.env.BASE_URL}${s.url}`);
          if (!res.ok) throw new Error(`Failed to fetch sample ${s.name} (${res.status})`);
          return { name: s.name, messages: parseOutlookCsv(await res.text(), s.name) };
        }),
      );
      ingestItems(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ingestItems]);

  const onExport = useCallback(() => {
    if (!dataset) return;
    const blob = new Blob([exportDatasetJson(dataset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "idea-network-dataset.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [dataset]);

  const onImport = useCallback(
    async (file: File) => {
      setError(null);
      try {
        applyDataset(importDatasetJson(await file.text()));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [applyDataset],
  );

  const onClear = useCallback(() => {
    void clearDataset();
    applyDataset(null);
  }, [applyDataset]);

  // Query matches over the full dataset (null = no active query).
  const matchIds = useMemo<Set<string> | null>(() => {
    if (!dataset) return null;
    return runQuery(dataset, search);
  }, [dataset, search]);

  // Visible graph = type filters + optional co-occurrence layer + isolation
  // + (optionally) hiding query non-matches.
  const visibleGraph = useMemo<GraphData | null>(() => {
    if (!dataset) return null;
    let nodes = dataset.graph.nodes.filter((n) => enabledTypes.has(n.type));
    if (hideNonMatching && matchIds !== null) nodes = nodes.filter((n) => matchIds.has(n.id));
    if (expandedIds.size > 0) {
      const present = new Set(nodes.map((n) => n.id));
      for (const n of dataset.graph.nodes) {
        if (expandedIds.has(n.id) && !present.has(n.id)) nodes.push(n);
      }
    }
    if (hiddenIds.size > 0) nodes = nodes.filter((n) => !hiddenIds.has(n.id));
    let nodeIds = new Set(nodes.map((n) => n.id));
    let links = dataset.graph.links.filter(
      (l) =>
        (l.type !== "cooccurs" || showPersonLinks) &&
        (l.type === "cooccurs" || enabledLinkTypes.has(l.type)) &&
        l.weight >= densitySettings.minLinkWeight &&
        nodeIds.has(linkEndId(l.source)) &&
        nodeIds.has(linkEndId(l.target)),
    );
    if (isolatedId && nodeIds.has(isolatedId)) {
      const keep = new Set<string>([isolatedId]);
      for (const l of links) {
        const s = linkEndId(l.source);
        const t = linkEndId(l.target);
        if (s === isolatedId) keep.add(t);
        if (t === isolatedId) keep.add(s);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      nodeIds = new Set(nodes.map((n) => n.id));
      links = links.filter((l) => nodeIds.has(linkEndId(l.source)) && nodeIds.has(linkEndId(l.target)));
    }
    return { nodes, links };
  }, [
    dataset,
    enabledTypes,
    showPersonLinks,
    isolatedId,
    hideNonMatching,
    matchIds,
    expandedIds,
    hiddenIds,
    enabledLinkTypes,
    densitySettings.minLinkWeight,
  ]);

  // When hiding non-matches the graph is already filtered — no need to dim.
  const highlightIds = hideNonMatching ? null : matchIds;

  const selectedNode = useMemo<GraphNode | null>(
    () => dataset?.graph.nodes.find((n) => n.id === selectedId) ?? null,
    [dataset, selectedId],
  );

  const onToggleType = useCallback((t: NodeType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id === null) {
      // Clicking empty graph space is a full reset: clear isolation and
      // close whichever side panel (details/charts/ask) is open.
      setIsolatedId(null);
      setPanel(null);
    } else {
      setPanel("details");
    }
  }, []);

  const onIsolate = useCallback((id: string) => {
    setIsolatedId((prev) => (prev === id ? null : id));
    setSelectedId(id);
    setPanel("details");
  }, []);

  const onPickNode = useCallback((id: string) => {
    setSelectedId(id);
    setPanel("details");
  }, []);

  const onApplyQuery = useCallback((q: string) => {
    setSearch(q);
  }, []);

  const onToggleMultiSelect = useCallback((id: string) => {
    setMultiSelectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onPin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onHide = useCallback((id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
    setSelectedId((sel) => (sel === id ? null : sel));
  }, []);

  const onExpandNeighbors = useCallback(
    (id: string) => {
      if (!dataset) return;
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const l of dataset.graph.links) {
          const s = linkEndId(l.source);
          const t = linkEndId(l.target);
          if (s === id) next.add(t);
          if (t === id) next.add(s);
        }
        return next;
      });
      setHiddenIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const l of dataset.graph.links) {
          const s = linkEndId(l.source);
          const t = linkEndId(l.target);
          if (s === id) next.delete(t);
          if (t === id) next.delete(s);
        }
        return next;
      });
    },
    [dataset],
  );

  const onToggleLinkType = useCallback((t: Exclude<LinkType, "cooccurs">) => {
    setEnabledLinkTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const onResetLayout = useCallback(() => {
    setPinnedIds(new Set());
    graphApi.current?.resetLayout();
  }, []);

  const hasDates = useMemo(() => (dataset ? datasetHasDates(dataset.messages) : false), [dataset]);

  const maxLinkWeight = useMemo(() => {
    if (!dataset) return 1;
    let max = 1;
    for (const l of dataset.graph.links) if (l.weight > max) max = l.weight;
    return max;
  }, [dataset]);

  const currentViewState = useMemo<ViewState>(
    () => ({ search, enabledTypes: [...enabledTypes], showPersonLinks, hideNonMatching }),
    [search, enabledTypes, showPersonLinks, hideNonMatching],
  );

  const onApplyView = useCallback((v: SavedView) => {
    setSearch(v.search);
    setEnabledTypes(new Set(v.enabledTypes));
    setShowPersonLinks(v.showPersonLinks);
    setHideNonMatching(v.hideNonMatching);
  }, []);

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      { id: "charts", label: "Open charts", hint: "panel", run: () => setPanel("charts") },
      { id: "ask", label: "Ask AI", hint: "panel", run: () => setPanel("ask") },
      { id: "export", label: "Export dataset JSON", hint: "file", run: onExport },
      { id: "clear-query", label: "Clear search / query", run: () => setSearch("") },
      {
        id: "reset-view",
        label: "Reset view (selection, isolation, filters)",
        run: () => {
          setSelectedId(null);
          setIsolatedId(null);
          setPanel(null);
          setEnabledTypes(new Set(ALL_TYPES));
        },
      },
    ],
    [onExport],
  );

  return (
    <div className="app">
      <Sidebar
        graph={dataset?.graph ?? null}
        search={search}
        onSearch={setSearch}
        hideNonMatching={hideNonMatching}
        onToggleHide={setHideNonMatching}
        enabledTypes={enabledTypes}
        onToggleType={onToggleType}
        showPersonLinks={showPersonLinks}
        onTogglePersonLinks={setShowPersonLinks}
        onFiles={onFiles}
        onExport={onExport}
        onImport={onImport}
        onClear={onClear}
        hasData={!!dataset}
        currentViewState={currentViewState}
        onApplyView={onApplyView}
      />
      <main className="main">
        {booting ? null : !dataset || !visibleGraph ? (
          <EmptyState onFiles={onFiles} onLoadSamples={onLoadSamples} loading={loading} error={error} progress={parseProgress} />
        ) : (
          <DropOverlay onFiles={onFiles}>
            <GraphView
              ref={graphApi}
              graph={visibleGraph}
              messages={dataset.messages}
              selectedId={selectedId}
              highlightIds={highlightIds}
              layoutMode={layoutMode}
              density={densitySettings}
              pinnedIds={pinnedIds}
              multiSelectIds={multiSelectIds}
              onSelect={onSelect}
              onIsolate={onIsolate}
              onToggleMultiSelect={onToggleMultiSelect}
              onPin={onPin}
              onHide={onHide}
              onExpandNeighbors={onExpandNeighbors}
            >
              <GraphControls api={graphApi} selectedId={selectedId} onResetLayout={onResetLayout} />
              <div className="graph-side">
                <GraphLayoutControls mode={layoutMode} onChange={setLayoutMode} hasDates={hasDates} />
                <GraphDensityControls
                  settings={densitySettings}
                  onChange={setDensitySettings}
                  enabledLinkTypes={enabledLinkTypes}
                  onToggleLinkType={onToggleLinkType}
                  maxLinkWeight={maxLinkWeight}
                />
              </div>
            </GraphView>
            {isolatedId && <div className="graph-hint">Isolated neighborhood — click background or double-click again to reset</div>}
            <StatsBar dataset={dataset} visibleNodes={visibleGraph.nodes.length} visibleLinks={visibleGraph.links.length} />

            <div className="dock">
              <button
                className={`dock-btn ${panel === "charts" ? "active" : ""}`}
                onClick={() => setPanel((p) => (p === "charts" ? null : "charts"))}
                title="Charts"
              >
                📊
              </button>
              <button
                className={`dock-btn ${panel === "ask" ? "active" : ""}`}
                onClick={() => setPanel((p) => (p === "ask" ? null : "ask"))}
                title="Ask AI"
              >
                ✦
              </button>
              <button className="dock-btn" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">
                ⌘
              </button>
            </div>

            <DetailPanel
              dataset={dataset}
              node={panel === "details" ? selectedNode : null}
              onNavigate={onPickNode}
              onClose={() => setPanel(null)}
            />
            <div className={`detail ${panel === "charts" ? "open" : ""}`}>
              {panel === "charts" && <ChartsPanel dataset={dataset} onPick={onPickNode} onClose={() => setPanel(null)} />}
            </div>
            <div className={`detail ${panel === "ask" ? "open" : ""}`}>
              {panel === "ask" && (
                <AskPanel dataset={dataset} onApplyQuery={onApplyQuery} onPick={onPickNode} onClose={() => setPanel(null)} />
              )}
            </div>
          </DropOverlay>
        )}
        {dataset && error && (
          <div className="graph-hint" style={{ color: "var(--danger)", top: 44 }}>{error}</div>
        )}
        {paletteOpen && (
          <CommandPalette
            dataset={dataset}
            actions={paletteActions}
            onSelectNode={onPickNode}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </main>
    </div>
  );
}
