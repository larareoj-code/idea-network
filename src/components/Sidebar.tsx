import { useRef, useState } from "react";
import type { GraphData, NodeType } from "../lib/types";
import { NODE_COLORS } from "./GraphView";
import { APP_VERSION } from "../lib/dataset";
import { QUERY_HELP } from "../lib/query";
import { FILE_ACCEPT } from "../lib/ingest";

const TYPE_LABELS: Record<NodeType, string> = {
  person: "People",
  thread: "Threads",
  concept: "Concepts",
  sop: "SOP / Data refs",
};

export const ALL_TYPES: NodeType[] = ["person", "thread", "concept", "sop"];

interface Props {
  graph: GraphData | null;
  search: string;
  onSearch: (v: string) => void;
  hideNonMatching: boolean;
  onToggleHide: (v: boolean) => void;
  enabledTypes: Set<NodeType>;
  onToggleType: (t: NodeType) => void;
  showPersonLinks: boolean;
  onTogglePersonLinks: (v: boolean) => void;
  onFiles: (files: File[]) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
  hasData: boolean;
}

export default function Sidebar({
  graph,
  search,
  onSearch,
  hideNonMatching,
  onToggleHide,
  enabledTypes,
  onToggleType,
  showPersonLinks,
  onTogglePersonLinks,
  onFiles,
  onExport,
  onImport,
  onClear,
  hasData,
}: Props) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const counts: Record<NodeType, number> = { person: 0, thread: 0, concept: 0, sop: 0 };
  if (graph) for (const n of graph.nodes) counts[n.type] += 1;

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Idea Network</h1>
        <span className="badge">{APP_VERSION}</span>
      </div>

      <div>
        <div className="section-label">Data</div>
        <div className="btn-row">
          <button className="btn primary" onClick={() => csvInputRef.current?.click()}>
            Add files…
          </button>
          {hasData && (
            <button className="btn danger" onClick={onClear} title="Clear all loaded data">
              Clear
            </button>
          )}
        </div>
        <input
          ref={csvInputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      <QuerySection
        search={search}
        onSearch={onSearch}
        hideNonMatching={hideNonMatching}
        onToggleHide={onToggleHide}
      />

      <div>
        <div className="section-label">Node types</div>
        <div className="chips">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              className={`chip ${enabledTypes.has(t) ? "" : "off"}`}
              onClick={() => onToggleType(t)}
            >
              <span
                className={`swatch ${t === "sop" ? "diamond" : ""}`}
                style={{ background: NODE_COLORS[t] }}
              />
              {TYPE_LABELS[t]}
              <span className="count">{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="section-label">Layers</div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={showPersonLinks}
            onChange={(e) => onTogglePersonLinks(e.target.checked)}
          />
          Person–person co-occurrence
        </label>
      </div>

      <div>
        <div className="section-label">Dataset</div>
        <div className="btn-row">
          <button className="btn" onClick={onExport} disabled={!hasData}>
            Export JSON
          </button>
          <button className="btn" onClick={() => jsonInputRef.current?.click()}>
            Import JSON
          </button>
        </div>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="sidebar-footer">
        Click a node to inspect · double-click to isolate · <kbd>Ctrl</kbd>+<kbd>K</kbd> command
        palette · <kbd>Esc</kbd> reset.
      </div>
    </aside>
  );
}

function QuerySection({
  search,
  onSearch,
  hideNonMatching,
  onToggleHide,
}: {
  search: string;
  onSearch: (v: string) => void;
  hideNonMatching: boolean;
  onToggleHide: (v: boolean) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div>
      <div className="section-label">
        Search / query
        <button className="help-toggle" onClick={() => setShowHelp((v) => !v)} title="Query syntax">
          ?
        </button>
      </div>
      <input
        className="search-input"
        type="search"
        placeholder="phase · from:hunt · type:concept…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <label className="toggle-row" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={hideNonMatching} onChange={(e) => onToggleHide(e.target.checked)} />
        Hide non-matching nodes
      </label>
      {showHelp && (
        <div className="query-help">
          {QUERY_HELP.map(([syntax, desc]) => (
            <div key={syntax} className="query-help-row">
              <code>{syntax}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
