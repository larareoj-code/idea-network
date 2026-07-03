import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, GraphLink, GraphNode } from "../lib/types";
import {
  askAssistant,
  explainGraph,
  draftQuery,
  loadLlmConfig,
  saveLlmConfig,
  LLM_PRESETS,
  type LlmConfig,
  type Citation,
} from "../lib/llm";
import { loadAskHistory, saveAskHistory, type AskHistoryEntry } from "../lib/storage";
import { buildChart } from "../lib/charts";
import { Chart } from "./Charts";
import ProviderSetup, { loadProviderConfig, saveProviderConfig } from "./ProviderSetup";

const PRIVACY_ACK_KEY = "idea-network:llm-privacy-ack";

function loadPrivacyAck(): boolean {
  try {
    return localStorage.getItem(PRIVACY_ACK_KEY) === "true";
  } catch {
    return false;
  }
}

function savePrivacyAck(): void {
  try {
    localStorage.setItem(PRIVACY_ACK_KEY, "true");
  } catch {
    // best-effort
  }
}

interface Exchange extends AskHistoryEntry {
  pending?: boolean;
  citations?: Citation[];
}

type AskMode = "ask" | "explain" | "draft";

interface Props {
  dataset: Dataset;
  onApplyQuery: (query: string) => void;
  onPick: (nodeId: string) => void;
  onClose: () => void;
  visibleNodes?: GraphNode[];
  visibleLinks?: GraphLink[];
}

export default function AskPanel({ dataset, onApplyQuery, onPick, onClose, visibleNodes = [], visibleLinks = [] }: Props) {
  const [config, setConfig] = useState<LlmConfig>(() => loadProviderConfig() ?? loadLlmConfig());
  const [showSettings, setShowSettings] = useState(() => {
    const saved = loadProviderConfig() ?? loadLlmConfig();
    const preset = LLM_PRESETS.find((p) => p.id === saved.provider);
    return (preset?.needsKey ?? true) && !saved.apiKey;
  });
  const [question, setQuestion] = useState("");
  const [draftInput, setDraftInput] = useState("");
  const [mode, setMode] = useState<AskMode>("ask");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [privacyAcked, setPrivacyAcked] = useState(loadPrivacyAck);
  const [privacyDontShow, setPrivacyDontShow] = useState(false);
  const [showPrivacyBanner, setShowPrivacyBanner] = useState(false);
  const nextId = useRef(0);
  const historyLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadAskHistory().then((entries) => {
      if (!cancelled && entries && entries.length > 0) {
        setHistory(entries);
        nextId.current = Math.max(...entries.map((e) => e.id)) + 1;
      }
      historyLoaded.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyLoaded.current || history.some((x) => x.pending)) return;
    void saveAskHistory(history.map(({ pending: _p, citations: _c, ...entry }) => entry));
  }, [history]);

  const preset = useMemo(() => LLM_PRESETS.find((p) => p.id === config.provider), [config.provider]);
  const keyMissing = (preset?.needsKey ?? true) && !config.apiKey;
  const isOllama = config.provider === "ollama";

  const updateConfig = (next: LlmConfig) => {
    setConfig(next);
    saveLlmConfig(next);
    saveProviderConfig(next);
  };

  const dismissPrivacy = () => {
    if (privacyDontShow) savePrivacyAck();
    setPrivacyAcked(true);
    setShowPrivacyBanner(false);
  };

  const maybeShowPrivacy = (): boolean => {
    if (privacyAcked || isOllama) return false;
    setShowPrivacyBanner(true);
    return true;
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || keyMissing) return;
    if (maybeShowPrivacy()) return;
    setQuestion("");
    const id = nextId.current++;
    setHistory((h) => [{ id, question: q, pending: true }, ...h]);
    try {
      const result = await askAssistant(config, dataset, q);
      setHistory((h) =>
        h.map((x) => (x.id === id ? { id, question: q, result, citations: result.citations } : x))
      );
      if (result.query) onApplyQuery(result.query);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: q, error } : x)));
    }
  };

  const explain = async () => {
    if (keyMissing) return;
    if (maybeShowPrivacy()) return;
    const label = "Explain this graph";
    const id = nextId.current++;
    setHistory((h) => [{ id, question: label, pending: true }, ...h]);
    try {
      const answer = await explainGraph(config, visibleNodes, visibleLinks);
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: label, result: { answer } } : x)));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: label, error } : x)));
    }
  };

  const draft = async () => {
    const desc = draftInput.trim();
    if (!desc || keyMissing) return;
    if (maybeShowPrivacy()) return;
    setDraftInput("");
    const label = `Draft query: ${desc}`;
    const id = nextId.current++;
    setHistory((h) => [{ id, question: label, pending: true }, ...h]);
    try {
      const query = await draftQuery(config, desc);
      const trimmed = query.trim();
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: label, result: { answer: `Query: ${trimmed}`, query: trimmed } } : x)));
      if (trimmed) onApplyQuery(trimmed);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: label, error } : x)));
    }
  };

  return (
    <>
      <div className="detail-header">
        <div>
          <h2>Ask AI</h2>
          <div className="sub">
            <span className="provider-status-chip">{preset?.label ?? config.provider} · {config.model}</span>
          </div>
        </div>
        <button className="btn small" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? "Done" : "Settings"}
        </button>
        <button className="detail-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>
      <div className="detail-body">
        {showSettings && (
          <div className="detail-section">
            <ProviderSetup
              current={config}
              onSelect={(next) => {
                updateConfig(next);
                setShowSettings(false);
              }}
            />
          </div>
        )}

        {showPrivacyBanner && (
          <div className="privacy-banner">
            <div className="privacy-text">
              Message excerpts will be sent to <strong>{preset?.label ?? config.provider}</strong> to answer your question. No full message bodies are included — only relevant snippets. Check your organization's data policy before using this with sensitive email.
            </div>
            <label className="privacy-checkbox">
              <input
                type="checkbox"
                checked={privacyDontShow}
                onChange={(e) => setPrivacyDontShow(e.target.checked)}
              />
              {" "}Don't show again
            </label>
            <button className="btn primary" onClick={dismissPrivacy}>Got it</button>
          </div>
        )}

        <div className="detail-section ask-mode-bar">
          <button
            className={`btn small${mode === "ask" ? " active" : ""}`}
            onClick={() => setMode("ask")}
          >
            Ask
          </button>
          <button
            className={`btn small${mode === "explain" ? " active" : ""}`}
            onClick={() => setMode("explain")}
          >
            Explain this graph
          </button>
          <button
            className={`btn small${mode === "draft" ? " active" : ""}`}
            onClick={() => setMode("draft")}
          >
            Draft query
          </button>
        </div>

        <div className="detail-section">
          {mode === "ask" && (
            <>
              <textarea
                className="ask-input"
                rows={2}
                placeholder={
                  keyMissing
                    ? "Add an API key in Settings first…"
                    : 'e.g. "Who sends the most maintenance reports?" or "Chart the busiest threads"'
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask();
                  }
                }}
                disabled={keyMissing}
              />
              <button className="btn primary full" onClick={() => void ask()} disabled={keyMissing || !question.trim()}>
                Ask
              </button>
            </>
          )}

          {mode === "explain" && (
            <>
              <div className="hint" style={{ marginBottom: 8 }}>
                Summarizes the {visibleNodes.length} visible nodes and {visibleLinks.length} links currently on screen.
              </div>
              <button className="btn primary full" onClick={() => void explain()} disabled={keyMissing || visibleNodes.length === 0}>
                Explain this graph
              </button>
            </>
          )}

          {mode === "draft" && (
            <>
              <textarea
                className="ask-input"
                rows={2}
                placeholder='e.g. "threads involving Alice about maintenance"'
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void draft();
                  }
                }}
                disabled={keyMissing}
              />
              <button className="btn primary full" onClick={() => void draft()} disabled={keyMissing || !draftInput.trim()}>
                Translate to query
              </button>
            </>
          )}
        </div>

        {history.map((x) => (
          <div key={x.id} className="detail-section ask-exchange">
            <div className="ask-q">{x.question}</div>
            {x.pending && <div className="ask-pending">Thinking…</div>}
            {x.error && <div className="ask-error">{x.error}</div>}
            {x.result && (
              <>
                <div className="ask-a">{x.result.answer}</div>
                {x.result.query && (
                  <button className="query-chip" onClick={() => onApplyQuery(x.result!.query!)} title="Apply this query to the graph">
                    ⌕ {x.result.query}
                  </button>
                )}
                {x.result.chart && (
                  <Chart spec={buildChart(dataset, x.result.chart.metric, x.result.chart.topN)} onPick={onPick} />
                )}
                {x.citations && x.citations.length > 0 && (
                  <div className="citations">
                    <div className="citations-label">Sources</div>
                    {x.citations.map((c) => (
                      <button
                        key={c.index}
                        className="citation-chip"
                        onClick={() => onPick(c.threadId)}
                        title={c.snippet}
                      >
                        [{c.index}] {c.subject} <span className="citation-from">({c.from})</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
