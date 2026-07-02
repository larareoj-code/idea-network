import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, GraphNode } from "../lib/types";
import { NODE_COLORS } from "./GraphView";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  dataset: Dataset | null;
  actions: PaletteAction[];
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

interface Row {
  key: string;
  label: string;
  hint?: string;
  node?: GraphNode;
  run: () => void;
}

export default function CommandPalette({ dataset, actions, onSelectNode, onClose }: Props) {
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const q = input.trim().toLowerCase();
    const actionRows: Row[] = actions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ key: `action:${a.id}`, label: a.label, hint: a.hint, run: a.run }));

    let nodeRows: Row[] = [];
    if (q && dataset) {
      nodeRows = dataset.graph.nodes
        .filter((n) => n.label.toLowerCase().includes(q) || (n.fullLabel ?? "").toLowerCase().includes(q))
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 12)
        .map((n) => ({
          key: n.id,
          label: n.label,
          hint: n.type,
          node: n,
          run: () => onSelectNode(n.id),
        }));
    }
    return [...nodeRows, ...actionRows];
  }, [input, dataset, actions, onSelectNode]);

  useEffect(() => setCursor(0), [input]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[cursor];
      if (row) {
        row.run();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search nodes or run a command…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {rows.length === 0 && <div className="palette-empty">No matches.</div>}
          {rows.map((row, i) => (
            <div
              key={row.key}
              data-idx={i}
              className={`palette-row ${i === cursor ? "active" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                row.run();
                onClose();
              }}
            >
              {row.node ? (
                <span
                  className={`swatch ${row.node.type === "sop" ? "diamond" : ""}`}
                  style={{ background: NODE_COLORS[row.node.type] }}
                />
              ) : (
                <span className="palette-glyph">›</span>
              )}
              <span className="palette-label">{row.label}</span>
              {row.hint && <span className="palette-hint">{row.hint}</span>}
            </div>
          ))}
        </div>
        <div className="palette-footer">↑↓ navigate · Enter select · Esc close</div>
      </div>
    </div>
  );
}
