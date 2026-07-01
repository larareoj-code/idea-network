import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";

interface Props {
  onFiles: (files: File[]) => void;
  onLoadSamples: () => void;
  loading: boolean;
  error: string | null;
}

function useDrag(onFiles: (files: File[]) => void) {
  const [drag, setDrag] = useState(false);
  const depth = useRef(0);
  return {
    drag,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        e.preventDefault();
        depth.current += 1;
        setDrag(true);
      },
      onDragLeave: (e: DragEvent) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setDrag(false);
      },
      onDragOver: (e: DragEvent) => e.preventDefault(),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        depth.current = 0;
        setDrag(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.name.toLowerCase().endsWith(".csv"),
        );
        if (files.length) onFiles(files);
      },
    },
  };
}

/** Full-screen hero shown when no data is loaded. */
export function EmptyState({ onFiles, onLoadSamples, loading, error }: Props) {
  const { drag, handlers } = useDrag(onFiles);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="hero" {...handlers}>
      <div className={`dropzone ${drag ? "drag" : ""}`}>
        <div className="glyph">🕸️</div>
        <h2>Build your idea network</h2>
        <p>
          Drop one or more Outlook CSV exports here to map people, threads, concepts, and
          SOP/data references from your email.
        </p>
        <div className="steps">
          In Outlook: <code>File → Open &amp; Export → Import/Export → Export to a file →
          Comma Separated Values</code> — then drop the CSV(s) here.
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading ? "Parsing…" : "Choose CSV files"}
          </button>
          <button className="btn" onClick={onLoadSamples} disabled={loading}>
            Load sample data
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/** Invisible drop target wrapping the graph so additive uploads work anywhere. */
export function DropOverlay({ onFiles, children }: { onFiles: (files: File[]) => void; children: ReactNode }) {
  const { drag, handlers } = useDrag(onFiles);
  return (
    <div className={`dropzone-mini ${drag ? "drag" : ""}`} style={{ height: "100%" }} {...handlers}>
      {children}
    </div>
  );
}
