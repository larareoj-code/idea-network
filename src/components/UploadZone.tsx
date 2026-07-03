import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { ACCEPTED_EXTENSIONS, FILE_ACCEPT, type ParseProgress } from "../lib/ingest";

interface FirstRunProps {
  onFiles: (files: File[]) => void;
  onLoadSamples: () => void;
  onReopenSaved: () => void;
  hasSaved: boolean;
}

/** Three-path welcome screen shown on first visit (no dataset, not booting). */
export function FirstRunScreen({ onFiles, onLoadSamples, onReopenSaved, hasSaved }: FirstRunProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="firstrun-bg">
      <div className="firstrun-wrap">
        <div className="firstrun-header">
          <svg className="firstrun-logo" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="18" cy="18" r="5" fill="var(--accent)" opacity="0.9"/>
            <circle cx="6" cy="10" r="3.5" fill="var(--concept)" opacity="0.8"/>
            <circle cx="30" cy="10" r="3.5" fill="var(--person)" opacity="0.8"/>
            <circle cx="6" cy="26" r="3.5" fill="var(--thread)" opacity="0.8"/>
            <circle cx="30" cy="26" r="3.5" fill="var(--sop)" opacity="0.8"/>
            <line x1="18" y1="13" x2="6" y2="10" stroke="var(--border-strong)" strokeWidth="1.5"/>
            <line x1="18" y1="13" x2="30" y2="10" stroke="var(--border-strong)" strokeWidth="1.5"/>
            <line x1="18" y1="23" x2="6" y2="26" stroke="var(--border-strong)" strokeWidth="1.5"/>
            <line x1="18" y1="23" x2="30" y2="26" stroke="var(--border-strong)" strokeWidth="1.5"/>
          </svg>
          <h1 className="firstrun-title">Idea Network</h1>
          <p className="firstrun-subtitle">Map the people, threads, and concepts in your email.</p>
        </div>

        <div className="firstrun-cards">
          <button className="firstrun-card firstrun-card--primary" onClick={onLoadSamples}>
            <svg className="firstrun-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span className="firstrun-card-title">Load demo</span>
            <span className="firstrun-card-desc">Explore a synthetic dataset instantly — no files needed.</span>
          </button>

          <button className="firstrun-card" onClick={() => inputRef.current?.click()}>
            <svg className="firstrun-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="firstrun-card-title">Import Outlook export</span>
            <span className="firstrun-card-desc">Drop .csv, .pst, .msg, or .eml files from your inbox.</span>
          </button>

          <button
            className={`firstrun-card ${!hasSaved ? "firstrun-card--disabled" : ""}`}
            onClick={hasSaved ? onReopenSaved : undefined}
            disabled={!hasSaved}
            title={hasSaved ? undefined : "No saved graph found in this browser"}
          >
            <svg className="firstrun-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span className="firstrun-card-title">Reopen saved graph</span>
            <span className="firstrun-card-desc">{hasSaved ? "Continue from your last session." : "No saved graph in this browser yet."}</span>
          </button>
        </div>

        <input
          ref={inputRef}
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
    </div>
  );
}

interface Props {
  onFiles: (files: File[]) => void;
  onLoadSamples: () => void;
  loading: boolean;
  error: string | null;
  progress?: ParseProgress | null;
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
          ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)),
        );
        if (files.length) onFiles(files);
      },
    },
  };
}

/** Full-screen hero shown when no data is loaded. */
export function EmptyState({ onFiles, onLoadSamples, loading, error, progress }: Props) {
  const { drag, handlers } = useDrag(onFiles);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="hero" {...handlers}>
      <div className={`dropzone ${drag ? "drag" : ""}`}>
        <div className="glyph">🕸️</div>
        <h2>Build your idea network</h2>
        <p>
          Drop Outlook exports here — <b>.pst</b> data files, <b>.csv</b> exports, or individual{" "}
          <b>.msg</b> / <b>.eml</b> messages — to map people, threads, concepts, and SOP/data
          references from your email.
        </p>
        <div className="steps">
          In Outlook: <code>File → Open &amp; Export → Import/Export → Export to a file</code> —
          pick <code>Outlook Data File (.pst)</code> (keeps dates) or{" "}
          <code>Comma Separated Values</code>, then drop the file(s) here. You can also drag
          messages straight out of Outlook and drop the .msg files.
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading
              ? progress
                ? `Parsing ${progress.index + 1} of ${progress.total}: ${progress.name}`
                : "Parsing…"
              : "Choose files"}
          </button>
          <button className="btn" onClick={onLoadSamples} disabled={loading}>
            Load sample data
          </button>
        </div>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <input
          ref={inputRef}
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
