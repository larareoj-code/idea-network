import { useRef, useState } from "react";
import type { GraphData, NodeType } from "../lib/types";
import { NODE_COLORS } from "./GraphView";
import { APP_VERSION } from "../lib/dataset";
import { QUERY_HELP } from "../lib/query";
import { FILE_ACCEPT } from "../lib/ingest";
import { getStoredTheme, toggleTheme, type Theme } from "../lib/theme";
import {
  deleteView,
  listSavedViews,
  PRESET_VIEWS,
  renameView,
  saveView,
  type SavedView,
} from "../lib/savedViews";
import { deleteQuery, listQueries, saveQuery, type SavedQuery } from "../lib/savedQueries";

const TYPE_LABELS: Record<NodeType, string> = {
  person: "People",
  thread: "Threads",
  concept: "Concepts",
  sop: "SOP / Data refs",
};

export const ALL_TYPES: NodeType[] = ["person", "thread", "concept", "sop"];

export interface ViewState {
  search: string;
  enabledTypes: NodeType[];
  showPersonLinks: boolean;
  hideNonMatching: boolean;
}

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
  currentViewState: ViewState;
  onApplyView: (view: SavedView) => void;
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
  currentViewState,
  onApplyView,
}: Props) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const counts: Record<NodeType, number> = { person: 0, thread: 0, concept: 0, sop: 0 };
  if (graph) for (const n of graph.nodes) counts[n.type] += 1;

  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>Idea Network</h1>
        <span className="badge">{APP_VERSION}</span>
        <button
          className="theme-toggle"
          onClick={() => setThemeState(toggleTheme())}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
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
      <SavedQueriesSection search={search} onSearch={onSearch} />

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

      <ViewsSection currentViewState={currentViewState} onApplyView={onApplyView} />

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

function ViewsSection({
  currentViewState,
  onApplyView,
}: {
  currentViewState: ViewState;
  onApplyView: (view: SavedView) => void;
}) {
  const [views, setViews] = useState<SavedView[]>(listSavedViews);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const onSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews(saveView({ id: crypto.randomUUID(), name: trimmed, ...currentViewState }));
    setName("");
  };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (renamingId && trimmed) setViews(renameView(renamingId, trimmed));
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div>
      <div className="section-label">Views</div>
      <div className="view-save-row">
        <input
          className="search-input"
          type="text"
          placeholder="View name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
          }}
        />
        <button className="btn small" onClick={onSave} disabled={!name.trim()} title="Save current view">
          Save
        </button>
      </div>
      <div className="view-list">
        {PRESET_VIEWS.map((v) => (
          <div key={v.id} className="view-row">
            <button className="view-apply" onClick={() => onApplyView(v)} title={`Apply preset "${v.name}"`}>
              {v.name} <span className="view-preset-badge">preset</span>
            </button>
          </div>
        ))}
        {views.map((v) =>
          renamingId === v.id ? (
            <div key={v.id} className="view-row">
              <input
                className="search-input"
                type="text"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={commitRename}
              />
            </div>
          ) : (
            <div key={v.id} className="view-row">
              <button className="view-apply" onClick={() => onApplyView(v)} title={`Apply view "${v.name}"`}>
                {v.name}
              </button>
              <button
                className="view-rename"
                onClick={() => {
                  setRenamingId(v.id);
                  setRenameValue(v.name);
                }}
                title={`Rename view "${v.name}"`}
              >
                ✎
              </button>
              <button className="view-delete" onClick={() => setViews(deleteView(v.id))} title={`Delete view "${v.name}"`}>
                ✕
              </button>
            </div>
          ),
        )}
      </div>
      {views.length === 0 && (
        <div className="view-empty">Save the current search + filters as a named view.</div>
      )}
    </div>
  );
}

interface BuilderState {
  nodeType: string;
  from: string;
  to: string;
  body: string;
  after: string;
  before: string;
  minDegree: string;
  source: string;
  via: string;
}

const EMPTY_BUILDER: BuilderState = {
  nodeType: "",
  from: "",
  to: "",
  body: "",
  after: "",
  before: "",
  minDegree: "",
  source: "",
  via: "",
};

function builderToDsl(b: BuilderState): string {
  const parts: string[] = [];
  if (b.nodeType) parts.push(`type:${b.nodeType}`);
  if (b.from.trim()) parts.push(`from:${b.from.trim().includes(" ") ? `"${b.from.trim()}"` : b.from.trim()}`);
  if (b.to.trim()) parts.push(`to:${b.to.trim().includes(" ") ? `"${b.to.trim()}"` : b.to.trim()}`);
  if (b.body.trim()) parts.push(`text:${b.body.trim().includes(" ") ? `"${b.body.trim()}"` : b.body.trim()}`);
  if (b.after) parts.push(`after:${b.after}`);
  if (b.before) parts.push(`before:${b.before}`);
  if (b.minDegree) parts.push(`min-degree:${b.minDegree}`);
  if (b.source.trim()) parts.push(`source:${b.source.trim()}`);
  if (b.via) parts.push(`via:${b.via}`);
  return parts.join(" ");
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
  const [builderMode, setBuilderMode] = useState(false);
  const [builder, setBuilder] = useState<BuilderState>(EMPTY_BUILDER);

  const preview = builderToDsl(builder);

  const applyBuilder = () => {
    onSearch(preview);
    setBuilderMode(false);
  };

  const setField = (field: keyof BuilderState, value: string) =>
    setBuilder((prev) => ({ ...prev, [field]: value }));

  return (
    <div>
      <div className="section-label">
        Search / query
        <button className="help-toggle" onClick={() => setShowHelp((v) => !v)} title="Query syntax">
          ?
        </button>
      </div>

      {!builderMode ? (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              className="search-input"
              type="search"
              placeholder="Search nodes…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn small"
              onClick={() => {
                setBuilderMode(true);
                setBuilder(EMPTY_BUILDER);
              }}
              title="Open query builder"
            >
              Build query
            </button>
          </div>
          <label className="toggle-row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={hideNonMatching} onChange={(e) => onToggleHide(e.target.checked)} />
            Hide non-matching nodes
          </label>
        </>
      ) : (
        <div className="query-builder">
          <div className="qb-row">
            <label className="qb-label">Type</label>
            <select className="select" value={builder.nodeType} onChange={(e) => setField("nodeType", e.target.value)}>
              <option value="">all</option>
              <option value="person">person</option>
              <option value="thread">thread</option>
              <option value="concept">concept</option>
              <option value="sop">sop</option>
            </select>
          </div>
          <div className="qb-row">
            <label className="qb-label">From</label>
            <input className="search-input" type="text" value={builder.from} onChange={(e) => setField("from", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">To</label>
            <input className="search-input" type="text" value={builder.to} onChange={(e) => setField("to", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">Body text</label>
            <input className="search-input" type="text" value={builder.body} onChange={(e) => setField("body", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">After</label>
            <input className="search-input" type="date" value={builder.after} onChange={(e) => setField("after", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">Before</label>
            <input className="search-input" type="date" value={builder.before} onChange={(e) => setField("before", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">Min degree</label>
            <input className="search-input" type="number" min={1} max={50} value={builder.minDegree} onChange={(e) => setField("minDegree", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">Source file</label>
            <input className="search-input" type="text" value={builder.source} onChange={(e) => setField("source", e.target.value)} />
          </div>
          <div className="qb-row">
            <label className="qb-label">Via link type</label>
            <select className="select" value={builder.via} onChange={(e) => setField("via", e.target.value)}>
              <option value="">any</option>
              <option value="participated">participated</option>
              <option value="mentions">mentions</option>
              <option value="references">references</option>
            </select>
          </div>
          <div className="qb-preview">
            <label className="qb-label">Preview query</label>
            <input className="search-input" type="text" readOnly value={preview} style={{ fontFamily: "monospace", fontSize: 11 }} />
          </div>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn primary small" onClick={applyBuilder} disabled={!preview}>
              Apply
            </button>
            <button className="btn small" onClick={() => setBuilderMode(false)}>
              Cancel
            </button>
          </div>
          <label className="toggle-row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={hideNonMatching} onChange={(e) => onToggleHide(e.target.checked)} />
            Hide non-matching nodes
          </label>
        </div>
      )}

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

function SavedQueriesSection({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [queries, setQueries] = useState<SavedQuery[]>(listQueries);
  const [savingName, setSavingName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);

  const onSave = () => {
    const trimmed = savingName.trim();
    if (!trimmed || !search.trim()) return;
    saveQuery(trimmed, search.trim());
    setQueries(listQueries());
    setSavingName("");
    setShowNameInput(false);
  };

  const onDelete = (id: string) => {
    deleteQuery(id);
    setQueries(listQueries());
  };

  return (
    <div>
      <div className="section-label" style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        Saved queries
        <span style={{ marginLeft: 4, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div>
          {queries.length === 0 && (
            <div className="view-empty">No saved queries yet.</div>
          )}
          {queries.map((q) => (
            <div key={q.id} className="view-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.name}</div>
                <code style={{ fontSize: 10, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", display: "block", whiteSpace: "nowrap" }}>{q.query}</code>
              </div>
              <button className="view-apply" title="Run query" onClick={() => onSearch(q.query)}>▶</button>
              <button className="view-delete" title="Delete query" onClick={() => onDelete(q.id)}>×</button>
            </div>
          ))}
          {search.trim() && !showNameInput && (
            <button className="btn small" style={{ marginTop: 4 }} onClick={() => setShowNameInput(true)}>
              Save current query
            </button>
          )}
          {showNameInput && (
            <div className="view-save-row" style={{ marginTop: 4 }}>
              <input
                className="search-input"
                type="text"
                placeholder="Query name…"
                value={savingName}
                autoFocus
                onChange={(e) => setSavingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave();
                  if (e.key === "Escape") setShowNameInput(false);
                }}
              />
              <button className="btn small" onClick={onSave} disabled={!savingName.trim()}>Save</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
