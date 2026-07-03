import { useState } from "react";
import { LLM_PRESETS, type LlmConfig } from "../lib/llm";

const PROVIDER_STORAGE_KEY = "idea-network:llm-provider";

const PROVIDER_DETAILS: Record<string, { badge: string; badgeClass: string; description: string; keyFormat: string }> = {
  groq: {
    badge: "Free tier",
    badgeClass: "badge-free",
    description: "Fast inference. Free API tier with generous limits.",
    keyFormat: "gsk_…",
  },
  gemini: {
    badge: "Free tier",
    badgeClass: "badge-free",
    description: "Generous free quota via Google AI Studio.",
    keyFormat: "AIzaSy…",
  },
  openrouter: {
    badge: "Free models",
    badgeClass: "badge-free",
    description: "Access many models. Free-tier models available.",
    keyFormat: "sk-or-…",
  },
  ollama: {
    badge: "Local",
    badgeClass: "badge-local",
    description: "Runs entirely on your machine. No key required.",
    keyFormat: "",
  },
};

export function loadProviderConfig(): LlmConfig | null {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LlmConfig;
  } catch {
    return null;
  }
}

export function saveProviderConfig(config: LlmConfig): void {
  try {
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // best-effort
  }
}

interface Props {
  current: LlmConfig;
  onSelect: (config: LlmConfig) => void;
}

export default function ProviderSetup({ current, onSelect }: Props) {
  const [drafts, setDrafts] = useState<Record<string, { apiKey: string; model: string }>>(() => {
    const init: Record<string, { apiKey: string; model: string }> = {};
    for (const p of LLM_PRESETS) {
      init[p.id] = {
        apiKey: p.id === current.provider ? current.apiKey : "",
        model: p.id === current.provider ? current.model : p.defaultModel,
      };
    }
    return init;
  });

  const select = (presetId: string) => {
    const p = LLM_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    const draft = drafts[presetId];
    const config: LlmConfig = {
      provider: p.id,
      baseUrl: p.baseUrl,
      apiKey: draft?.apiKey ?? "",
      model: draft?.model ?? p.defaultModel,
    };
    saveProviderConfig(config);
    onSelect(config);
  };

  return (
    <div className="provider-grid">
      {LLM_PRESETS.map((p) => {
        const detail = PROVIDER_DETAILS[p.id];
        const isActive = current.provider === p.id;
        const draft = drafts[p.id] ?? { apiKey: "", model: p.defaultModel };
        return (
          <div key={p.id} className={`provider-card${isActive ? " provider-card-active" : ""}`}>
            <div className="provider-card-header">
              <span className="provider-name">{p.label}</span>
              <span className={`provider-badge ${detail?.badgeClass ?? ""}`}>{detail?.badge}</span>
            </div>
            <div className="provider-desc">{detail?.description}</div>
            {p.needsKey && (
              <input
                className="search-input"
                type="password"
                placeholder={`API key (${detail?.keyFormat ?? ""})`}
                value={draft.apiKey}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [p.id]: { ...draft, apiKey: e.target.value } }))
                }
              />
            )}
            <input
              className="search-input"
              placeholder="Model"
              value={draft.model}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [p.id]: { ...draft, model: e.target.value } }))
              }
            />
            <button
              className={`btn${isActive ? " primary" : ""} full`}
              onClick={() => select(p.id)}
            >
              {isActive ? "Active" : "Use this provider"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
