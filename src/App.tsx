import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dataset, GraphData, GraphNode, NodeType } from "./lib/types";
import { parseOutlookCsv } from "./lib/parseOutlookCsv";
import {
  clearPersistedDataset,
  exportDatasetJson,
  importDatasetJson,
  loadPersistedDataset,
  mergeDataset,
  persistDataset,
} from "./lib/dataset";
import GraphView from "./components/GraphView";
import Sidebar, { ALL_TYPES } from "./components/Sidebar";
import DetailPanel from "./components/DetailPanel";
import StatsBar from "./components/StatsBar";
import { DropOverlay, EmptyState } from "./components/UploadZone";

const SAMPLES = [
  { url: "samples/inbox.csv", name: "inbox.csv" },
  { url: "samples/sent.csv", name: "sent.csv" },
];

const linkEndId = (v: unknown): string =>
  typeof v === "object" && v !== null ? (v as { id: string }).id : (v as string);

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(() => loadPersistedDataset());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [enabledTypes, setEnabledTypes] = useState<Set<NodeType>>(new Set(ALL_TYPES));
  const [showPersonLinks, setShowPersonLinks] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);

  useEffect(() => {
    if (dataset) persistDataset(dataset);
  }, [dataset]);

  const applyDataset = useCallback((next: Dataset | null) => {
    setDataset(next);
    setSelectedId(null);
    setIsolatedId(null);
  }, []);

  const ingestTexts = useCallback(
    (items: { name: string; text: string }[]) => {
      setError(null);
      try {
        let next = dataset;
        for (const item of items) {
          const messages = parseOutlookCsv(item.text, item.name);
          if (messages.length === 0) throw new Error(`${item.name}: no messages found — is this an Outlook CSV export?`);
          next = mergeDataset(next, messages, item.name);
        }
        applyDataset(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [dataset, applyDataset],
  );

  const onFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      try {
        const items = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
        ingestTexts(items);
      } finally {
        setLoading(false);
      }
    },
    [ingestTexts],
  );

  const onLoadSamples = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await Promise.all(
        SAMPLES.map(async (s) => {
          const res = await fetch(`${import.meta.env.BASE_URL}${s.url}`);
          if (!res.ok) throw new Error(`Failed to fetch sample ${s.name} (${res.status})`);
          return { name: s.name, text: await res.text() };
        }),
      );
      ingestTexts(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ingestTexts]);

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
    clearPersistedDataset();
    applyDataset(null);
  }, [applyDataset]);

  // Visible graph = type filters + optional co-occurrence layer + isolation.
  const visibleGraph = useMemo<GraphData | null>(() => {
    if (!dataset) return null;
    let nodes = dataset.graph.nodes.filter((n) => enabledTypes.has(n.type));
    let nodeIds = new Set(nodes.map((n) => n.id));
    let links = dataset.graph.links.filter(
      (l) =>
        (l.type !== "cooccurs" || showPersonLinks) &&
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
  }, [dataset, enabledTypes, showPersonLinks, isolatedId]);

  const highlightIds = useMemo<Set<string> | null>(() => {
    const q = search.trim().toLowerCase();
    if (!q || !visibleGraph) return null;
    const set = new Set<string>();
    for (const n of visibleGraph.nodes) {
      if (n.label.toLowerCase().includes(q) || (n.fullLabel ?? "").toLowerCase().includes(q)) {
        set.add(n.id);
      }
    }
    return set;
  }, [search, visibleGraph]);

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
    if (id === null) setIsolatedId(null);
  }, []);

  const onIsolate = useCallback((id: string) => {
    setIsolatedId((prev) => (prev === id ? null : id));
    setSelectedId(id);
  }, []);

  return (
    <div className="app">
      <Sidebar
        graph={dataset?.graph ?? null}
        search={search}
        onSearch={setSearch}
        enabledTypes={enabledTypes}
        onToggleType={onToggleType}
        showPersonLinks={showPersonLinks}
        onTogglePersonLinks={setShowPersonLinks}
        onFiles={onFiles}
        onExport={onExport}
        onImport={onImport}
        onClear={onClear}
        hasData={!!dataset}
      />
      <main className="main">
        {!dataset || !visibleGraph ? (
          <EmptyState onFiles={onFiles} onLoadSamples={onLoadSamples} loading={loading} error={error} />
        ) : (
          <DropOverlay onFiles={onFiles}>
            <GraphView
              graph={visibleGraph}
              selectedId={selectedId}
              highlightIds={highlightIds}
              onSelect={onSelect}
              onIsolate={onIsolate}
            />
            {isolatedId && <div className="graph-hint">Isolated neighborhood — click background or double-click again to reset</div>}
            <StatsBar dataset={dataset} visibleNodes={visibleGraph.nodes.length} visibleLinks={visibleGraph.links.length} />
            <DetailPanel
              dataset={dataset}
              node={selectedNode}
              onNavigate={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          </DropOverlay>
        )}
        {dataset && error && (
          <div className="graph-hint" style={{ color: "var(--danger)", top: 44 }}>{error}</div>
        )}
      </main>
    </div>
  );
}
