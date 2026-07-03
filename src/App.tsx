import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, GraphData, GraphNode, LinkType, NodeType } from "./lib/types";
import { APP_VERSION } from "./lib/dataset";
import { getStoredTheme, toggleTheme } from "./lib/theme";
import { parseOutlookCsv } from "./lib/parseOutlookCsv";
import { parseFiles, type ParseProgress, type IngestItem } from "./lib/ingest";
import { exportDatasetJson, importDatasetJson, mergeDataset } from "./lib/dataset";
import { clearDataset, loadDataset, saveDataset } from "./lib/storage";
import { runQuery } from "./lib/query";
import { buildImportSummary, type ImportSummary } from "./lib/importSummary";
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
import { DropOverlay, FirstRunScreen } from "./components/UploadZone";
import { ChartsPanel } from "./components/Charts";
import AskPanel from "./components/AskPanel";
import CommandPalette, { type PaletteAction } from "./components/CommandPalette";
import GraphSearch from "./components/GraphSearch";
import GraphFilters, { nonLargestComponentIds } from "./components/GraphFilters";
import GraphModeBar from "./components/GraphModeBar";
import ImportReviewPanel, { shouldSkipReview } from "./components/ImportReviewPanel";
import { GRAPH_MODES, type GraphMode } from "./lib/graphModes";

// Synthetic, fully fictional data (see public/demo-samples) — the real
// sample exports in public/samples/ are gitignored and never shipped.
const SAMPLES = [
  { url: "demo-samples/inbox.csv", name: "demo-inbox.csv" },
  { url: "demo-samples/sent.csv", name: "demo-sent.csv" },
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
  const [neighborhoodOnly, setNeighborhoodOnly] = useState(false);
  const [highDegreeOnly, setHighDegreeOnly] = useState(false);
  const [degreeThreshold, setDegreeThreshold] = useState(5);
  const [isolatedClusters, setIsolatedClusters] = useState(false);
  const [hideLowConnection, setHideLowConnection] = useState(false);
  const [adhocHighlight, setAdhocHighlight] = useState<Set<string> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [densitySettings, setDensitySettings] = useState<DensitySettings>(DEFAULT_DENSITY);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [enabledLinkTypes, setEnabledLinkTypes] = useState<Set<Exclude<LinkType, "cooccurs">>>(
    new Set(["participated", "mentions", "references"]),
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [theme, setThemeState] = useState(getStoredTheme);
  const [graphMode, setGraphMode] = useState<GraphMode | null>(null);
  const [pendingItems, setPendingItems] = useState<IngestItem[] | null>(null);
  const [pendingErrors, setPendingErrors] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const graphApi = useRef<GraphViewHandle | null>(null);

  useEffect(() => setAdhocHighlight(null), [search]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    void loadDataset().then((d) => {
      if (cancelled) return;
      // Never clobber data the user uploaded while the load was in flight.
      if (d) {
        setDataset((prev) => prev ?? d);
        setHasSaved(true);
      }
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

  const commitItems = useCallback(
    (items: IngestItem[], errors: string[]) => {
      if (items.length === 0) return;
      setDataset((prev) => {
        let next = prev;
        for (const item of items) next = mergeDataset(next, item.messages, item.name);
        return next;
      });
      setSelectedId(null);
      setIsolatedId(null);
      setPanel(null);
      if (errors.length) setError(errors.join(" · "));
    },
    [],
  );

  const ingestItems = useCallback(
    (items: IngestItem[], errors: string[] = []) => {
      if (items.length === 0) {
        if (errors.length) setError(errors.join(" · "));
        return;
      }
      if (shouldSkipReview()) {
        commitItems(items, errors);
        return;
      }
      // Build a preview dataset to populate summary totals
      setDataset((prev) => {
        let next = prev;
        for (const item of items) next = mergeDataset(next, item.messages, item.name);
        const summary = buildImportSummary(items, next!, prev, errors);
        // Schedule state updates outside the functional updater
        setTimeout(() => {
          setPendingItems(items);
          setPendingErrors(errors);
          setImportSummary(summary);
        }, 0);
        return prev; // don't commit yet
      });
    },
    [commitItems],
  );

  const onConfirmImport = useCallback(() => {
    if (!pendingItems) return;
    commitItems(pendingItems, pendingErrors);
    setPendingItems(null);
    setPendingErrors([]);
    setImportSummary(null);
  }, [pendingItems, pendingErrors, commitItems]);

  const onCancelImport = useCallback(() => {
    setPendingItems(null);
    setPendingErrors([]);
    setImportSummary(null);
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      setError(null);
      setParseProgress(null);
      try {
        const { items, errors } = await parseFiles(files, setParseProgress);
        ingestItems(items, errors);
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
    const prune = () => {
      nodeIds = new Set(nodes.map((n) => n.id));
      links = links.filter((l) => nodeIds.has(linkEndId(l.source)) && nodeIds.has(linkEndId(l.target)));
    };
    if (neighborhoodOnly && selectedId && nodeIds.has(selectedId)) {
      const keep = new Set<string>([selectedId]);
      for (const l of links) {
        const s = linkEndId(l.source);
        const t = linkEndId(l.target);
        if (s === selectedId) keep.add(t);
        if (t === selectedId) keep.add(s);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      prune();
    }
    if (highDegreeOnly) {
      nodes = nodes.filter((n) => n.degree >= degreeThreshold);
      prune();
    }
    if (hideLowConnection) {
      nodes = nodes.filter((n) => n.degree > 1);
      prune();
    }
    if (isolatedClusters) {
      const keep = nonLargestComponentIds(nodes, links);
      nodes = nodes.filter((n) => keep.has(n.id));
      prune();
    }
    return { nodes, links };
  }, [
    dataset,
    enabledTypes,
    showPersonLinks,
    isolatedId,
    hideNonMatching,
    matchIds,
    neighborhoodOnly,
    selectedId,
    highDegreeOnly,
    degreeThreshold,
    hideLowConnection,
    isolatedClusters,
    expandedIds,
    hiddenIds,
    enabledLinkTypes,
    densitySettings.minLinkWeight,
  ]);

  // When hiding non-matches the graph is already filtered — no need to dim.
  const highlightIds = adhocHighlight ?? (hideNonMatching ? null : matchIds);

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

  const matchList = useMemo<string[]>(() => {
    if (!dataset || matchIds === null) return [];
    return dataset.graph.nodes.filter((n) => matchIds.has(n.id)).map((n) => n.id);
  }, [dataset, matchIds]);

  const searchResultIndex = selectedId ? matchList.indexOf(selectedId) : -1;

  const stepMatch = useCallback(
    (dir: 1 | -1) => {
      if (matchList.length === 0) return;
      const next =
        searchResultIndex >= 0
          ? (searchResultIndex + dir + matchList.length) % matchList.length
          : dir === 1
            ? 0
            : matchList.length - 1;
      onPickNode(matchList[next]);
    },
    [matchList, searchResultIndex, onPickNode],
  );

  const onHideSelectedType = useCallback(() => {
    const t = dataset?.graph.nodes.find((n) => n.id === selectedId)?.type;
    if (!t) return;
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      next.delete(t);
      return next;
    });
  }, [dataset, selectedId]);

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

  const applyGraphMode = useCallback((mode: GraphMode) => {
    const cfg = GRAPH_MODES[mode];
    setGraphMode(mode);
    setEnabledTypes(new Set(cfg.enabledTypes));
    setLayoutMode(cfg.layoutMode);
    setEnabledLinkTypes(new Set(cfg.enabledLinkTypes));
    setSelectedId(null);
    setIsolatedId(null);
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
          setNeighborhoodOnly(false);
          setHighDegreeOnly(false);
          setIsolatedClusters(false);
          setHideLowConnection(false);
          setAdhocHighlight(null);
        },
      },
      {
        id: "only-concepts",
        label: "Show only concepts",
        hint: "filter",
        run: () => setEnabledTypes(new Set<NodeType>(["concept"])),
      },
      {
        id: "hide-people",
        label: "Hide people",
        hint: "filter",
        run: () =>
          setEnabledTypes((prev) => {
            const next = new Set(prev);
            next.delete("person");
            return next;
          }),
      },
      {
        id: "focus-cluster",
        label: "Focus selected cluster",
        hint: "filter",
        run: () => {
          if (!selectedId) setNotice("Select a node first, then run this to focus its neighborhood.");
          setNeighborhoodOnly(true);
        },
      },
      {
        id: "export-visible",
        label: "Export visible graph",
        hint: "file",
        run: () => {
          if (!visibleGraph) return;
          const blob = new Blob(
            [JSON.stringify({ nodes: visibleGraph.nodes, links: visibleGraph.links }, null, 2)],
            { type: "application/json" },
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "idea-network-visible-graph.json";
          a.click();
          URL.revokeObjectURL(url);
        },
      },
      {
        id: "save-view",
        label: "Save current view",
        run: () => setNotice("Use the Views section in the sidebar — it saves the current search and filters."),
      },
      {
        id: "find-orphans",
        label: "Find orphan nodes",
        run: () => {
          const orphans = new Set(
            (dataset?.graph.nodes ?? []).filter((n) => n.degree === 0).map((n) => n.id),
          );
          if (orphans.size === 0) {
            setNotice("No orphan nodes — everything is connected.");
            setAdhocHighlight(null);
          } else {
            setNotice(`${orphans.size} orphan node${orphans.size === 1 ? "" : "s"} highlighted.`);
            setAdhocHighlight(orphans);
          }
        },
      },
      {
        id: "strongest-links",
        label: "Show strongest connections",
        run: () => {
          if (!visibleGraph) return;
          const top = [...visibleGraph.links].sort((a, b) => b.weight - a.weight).slice(0, 10);
          const ids = new Set<string>();
          for (const l of top) {
            ids.add(linkEndId(l.source));
            ids.add(linkEndId(l.target));
          }
          if (ids.size === 0) {
            setNotice("No links in the visible graph.");
          } else {
            setNotice(`Top ${top.length} links by weight highlighted.`);
            setAdhocHighlight(ids);
          }
        },
      },
    ],
    [onExport, dataset, visibleGraph, selectedId],
  );

  return (
    <div className={`app ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <div className="topbar">
        <button
          className="topbar-sidebar-toggle btn-icon"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <line x1="3" y1="5" x2="17" y2="5"/>
            <line x1="3" y1="10" x2="17" y2="10"/>
            <line x1="3" y1="15" x2="17" y2="15"/>
          </svg>
        </button>
        <span className="topbar-brand">Idea Network</span>
        <span className="badge topbar-version">{APP_VERSION}</span>
        <button
          className="theme-toggle topbar-theme"
          onClick={() => setThemeState(toggleTheme())}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          className="topbar-cmd btn-icon"
          onClick={() => setPaletteOpen(true)}
          title="Command palette (Ctrl+K)"
          aria-label="Open command palette"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="16" height="16" rx="3"/>
            <path d="M6 8l-2 2 2 2M14 8l2 2-2 2M11 6l-2 8"/>
          </svg>
        </button>
      </div>
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
        {booting ? (
          <div className="loading-screen">
            <div className="spinner" aria-label="Loading…" />
          </div>
        ) : !dataset ? (
          <FirstRunScreen
            onFiles={onFiles}
            onLoadSamples={onLoadSamples}
            onReopenSaved={() => {
              void loadDataset().then((d) => { if (d) setDataset(d); });
            }}
            hasSaved={hasSaved}
          />
        ) : !visibleGraph ? (
          <div className="cleared-empty">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="cleared-empty-icon">
              <circle cx="24" cy="24" r="10" opacity="0.4"/>
              <circle cx="10" cy="14" r="4" opacity="0.3"/>
              <circle cx="38" cy="14" r="4" opacity="0.3"/>
              <circle cx="10" cy="34" r="4" opacity="0.3"/>
              <circle cx="38" cy="34" r="4" opacity="0.3"/>
            </svg>
            <p className="cleared-empty-text">No graph loaded — drop files or load the demo.</p>
            <div className="btn-row" style={{ justifyContent: "center" }}>
              <button className="btn primary" onClick={onLoadSamples} disabled={loading}>Load demo</button>
            </div>
          </div>
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
                <GraphModeBar activeMode={graphMode} hasDates={hasDates} onSelect={applyGraphMode} />
                <GraphLayoutControls mode={layoutMode} onChange={(m) => { setLayoutMode(m); setGraphMode(null); }} hasDates={hasDates} />
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
            <GraphSearch
              query={search}
              matchCount={matchList.length}
              position={searchResultIndex >= 0 ? searchResultIndex : null}
              onPrev={() => stepMatch(-1)}
              onNext={() => stepMatch(1)}
            />
            {multiSelectIds.size > 0 && (
              <div className="multiselect-bar">
                <span>{multiSelectIds.size} selected</span>
                <button onClick={() => { for (const id of multiSelectIds) onHide(id); setMultiSelectIds(new Set()); }}>Hide all</button>
                <button onClick={() => { for (const id of multiSelectIds) onPin(id); setMultiSelectIds(new Set()); }}>Pin all</button>
                <button onClick={() => setMultiSelectIds(new Set())}>Clear</button>
              </div>
            )}
            <GraphFilters
              neighborhoodOnly={neighborhoodOnly}
              onToggleNeighborhood={() => setNeighborhoodOnly((v) => !v)}
              highDegreeOnly={highDegreeOnly}
              onToggleHighDegree={() => setHighDegreeOnly((v) => !v)}
              degreeThreshold={degreeThreshold}
              onDegreeThreshold={setDegreeThreshold}
              isolatedClusters={isolatedClusters}
              onToggleIsolatedClusters={() => setIsolatedClusters((v) => !v)}
              hideLowConnection={hideLowConnection}
              onToggleHideLowConnection={() => setHideLowConnection((v) => !v)}
              selectedType={selectedNode?.type ?? null}
              onHideSelectedType={onHideSelectedType}
            />
            {notice && <div className="graph-hint graph-notice">{notice}</div>}

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
              onIsolate={onIsolate}
              onClose={() => setPanel(null)}
            />
            <div className={`detail ${panel === "charts" ? "open" : ""}`}>
              {panel === "charts" && (
                <ChartsPanel
                  dataset={dataset}
                  onPick={onPickNode}
                  onClose={() => setPanel(null)}
                  onHighlight={(nodeId) => {
                    setSelectedId(nodeId);
                    setPanel("details");
                    graphApi.current?.centerOn(nodeId);
                  }}
                />
              )}
            </div>
            <div className={`detail ${panel === "ask" ? "open" : ""}`}>
              {panel === "ask" && (
                <AskPanel dataset={dataset} onApplyQuery={onApplyQuery} onPick={onPickNode} onClose={() => setPanel(null)} />
              )}
            </div>
          </DropOverlay>
        )}
        {loading && parseProgress && (
          <div className="parse-progress-overlay">
            <div className="parse-progress-box">
              <div className="parse-progress-label">
                Parsing {parseProgress.index + 1} of {parseProgress.total}: {parseProgress.name}
              </div>
              <div className="parse-progress-track">
                <div
                  className="parse-progress-fill"
                  style={{ width: `${Math.round(((parseProgress.index + 1) / parseProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          </div>
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
        {importSummary && (
          <ImportReviewPanel
            summary={importSummary}
            onConfirm={onConfirmImport}
            onCancel={onCancelImport}
          />
        )}
      </main>
    </div>
  );
}
