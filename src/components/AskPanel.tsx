import { useMemo, useRef, useState } from "react";
import type { Dataset } from "../lib/types";
import {
  askAssistant,
  loadLlmConfig,
  saveLlmConfig,
  LLM_PRESETS,
  type AssistantResult,
  type LlmConfig,
} from "../lib/llm";
import { buildChart } from "../lib/charts";
import { Chart } from "./Charts";

interface Exchange {
  id: number;
  question: string;
  result?: AssistantResult;
  error?: string;
  pending?: boolean;
}

interface Props {
  dataset: Dataset;
  onApplyQuery: (query: string) => void;
  onPick: (nodeId: string) => void;
  onClose: () => void;
}

export default function AskPanel({ dataset, onApplyQuery, onPick, onClose }: Props) {
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [showSettings, setShowSettings] = useState(() => !loadLlmConfig().apiKey);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const nextId = useRef(0);

  const preset = useMemo(() => LLM_PRESETS.find((p) => p.id === config.provider), [config.provider]);
  const keyMissing = (preset?.needsKey ?? true) && !config.apiKey;

  const updateConfig = (next: LlmConfig) => {
    setConfig(next);
    saveLlmConfig(next);
  };

  const onPreset = (id: string) => {
    const p = LLM_PRESETS.find((x) => x.id === id);
    if (!p) return;
    updateConfig({ provider: p.id, baseUrl: p.baseUrl, model: p.defaultModel, apiKey: config.apiKey });
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || keyMissing) return;
    setQuestion("");
    const id = nextId.current++;
    setHistory((h) => [{ id, question: q, pending: true }, ...h]);
    try {
      const result = await askAssistant(config, dataset, q);
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: q, result } : x)));
      if (result.query) onApplyQuery(result.query);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setHistory((h) => h.map((x) => (x.id === id ? { id, question: q, error } : x)));
    }
  };

  return (
    <>
      <div className="detail-header">
        <div>
          <h2>Ask AI</h2>
          <div className="sub">
            {preset?.label ?? config.provider} · {config.model}
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
          <div className="detail-section llm-settings">
            <div className="section-label">Provider</div>
            <select className="select" value={config.provider} onChange={(e) => onPreset(e.target.value)}>
              {LLM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="section-label">Model</div>
            <input
              className="search-input"
              value={config.model}
              onChange={(e) => updateConfig({ ...config, model: e.target.value })}
            />
            <div className="section-label">API key</div>
            <input
              className="search-input"
              type="password"
              placeholder={preset?.needsKey ? "Paste API key…" : "Not required"}
              value={config.apiKey}
              onChange={(e) => updateConfig({ ...config, apiKey: e.target.value })}
            />
            <div className="hint">{preset?.keyHint}. Stored only in this browser; sent only to the provider above.</div>
          </div>
        )}

        <div className="detail-section">
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
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
