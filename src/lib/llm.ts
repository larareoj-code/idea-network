import type { Dataset, PersonMeta, ThreadMeta } from "./types";
import { CHART_METRICS, isChartMetric, type ChartMetric } from "./charts";
import { formatExcerpts, retrieveMessages } from "./retrieval";

/**
 * Provider-agnostic client for any OpenAI-compatible chat completions API.
 * The API key is kept in localStorage only — it never leaves the browser
 * except in the request to the configured provider.
 */

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  keyHint: string;
  needsKey: boolean;
}

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "groq",
    label: "Groq (free tier)",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keyHint: "console.groq.com → API Keys (free)",
    needsKey: true,
  },
  {
    id: "gemini",
    label: "Google Gemini (free tier)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    keyHint: "aistudio.google.com → Get API key (free)",
    needsKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter (free models)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    keyHint: "openrouter.ai → Keys",
    needsKey: true,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    keyHint: "No key needed — runs on your machine",
    needsKey: false,
  },
];

const CONFIG_KEY = "idea-network:llm-config:v1";

export function loadLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Partial<LlmConfig>;
      if (typeof c.baseUrl === "string" && typeof c.model === "string") {
        return { provider: c.provider ?? "groq", baseUrl: c.baseUrl, apiKey: c.apiKey ?? "", model: c.model };
      }
    }
  } catch {
    // fall through to default
  }
  const p = LLM_PRESETS[0];
  return { provider: p.id, baseUrl: p.baseUrl, apiKey: "", model: p.defaultModel };
}

export function saveLlmConfig(config: LlmConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // best-effort
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function postChat(config: LlmConfig, body: Record<string, unknown>): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      `Could not reach ${config.baseUrl} — check the URL, your network, or CORS (local Ollama needs OLLAMA_ORIGINS=*). ${e instanceof Error ? e.message : ""}`,
    );
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const detail = errBody.slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new Error(`Auth failed (${res.status}) — check your API key. ${detail}`);
    if (res.status === 429) throw new Error(`Rate limited (429) — free tier quota hit, wait a moment. ${detail}`);
    throw new Error(`LLM request failed (${res.status}): ${detail}`);
  }
  return res;
}

function contentFromJson(data: { choices?: { message?: { content?: string } }[] }): string {
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response.");
  return content;
}

export async function chatCompletion(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const res = await postChat(config, { model: config.model, messages, temperature: 0.2 });
  return contentFromJson((await res.json()) as { choices?: { message?: { content?: string } }[] });
}

interface SseChunk {
  choices?: { delta?: { content?: string }; message?: { content?: string } }[];
}

/**
 * Streaming variant: OpenAI-style SSE (`data: {...}` lines, `data: [DONE]`
 * terminator). Falls back to plain JSON parsing if the server ignores
 * `stream: true` and answers with a normal completion body.
 */
export async function streamChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  onToken?: (token: string) => void,
): Promise<string> {
  const res = await postChat(config, { model: config.model, messages, temperature: 0.2, stream: true });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.body || contentType.includes("application/json")) {
    const content = contentFromJson((await res.json()) as { choices?: { message?: { content?: string } }[] });
    onToken?.(content);
    return content;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const chunk = JSON.parse(payload) as SseChunk;
      const token = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;
      if (typeof token === "string" && token) {
        full += token;
        onToken?.(token);
      }
    } catch {
      // keep-alive / malformed line — skip
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      consume(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) consume(buffer);

  if (!full) throw new Error("LLM returned an empty response.");
  return full;
}

/** Compact plain-text digest of the dataset for the LLM's context window. */
export function buildDatasetContext(dataset: Dataset): string {
  const nodes = dataset.graph.nodes;
  const persons = nodes.filter((n) => n.type === "person");
  const threads = nodes.filter((n) => n.type === "thread");
  const concepts = nodes.filter((n) => n.type === "concept");
  const sops = nodes.filter((n) => n.type === "sop");

  const topSenders = persons
    .map((n) => ({ label: n.label, sent: (n.meta as PersonMeta).sentCount }))
    .filter((p) => p.sent > 0)
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 15)
    .map((p) => `${p.label} (${p.sent} sent)`);

  const topThreads = threads
    .map((n) => n.meta as ThreadMeta)
    .sort((a, b) => b.messageIds.length - a.messageIds.length)
    .slice(0, 20)
    .map((t) => `"${t.subject}" (${t.messageIds.length} msgs, ${t.participantKeys.length} people)`);

  return [
    `Email network dataset: ${dataset.messages.length} messages, ${persons.length} people, ${threads.length} threads, ${concepts.length} concepts, ${sops.length} SOP/data refs.`,
    `Sources: ${dataset.sources.map((s) => `${s.name} (${s.messageCount})`).join(", ")}`,
    `Top senders: ${topSenders.join("; ")}`,
    `Threads: ${topThreads.join("; ")}`,
    `Concepts: ${concepts.map((c) => `${c.label} (${c.count})`).join("; ")}`,
    `SOP/data refs: ${sops.map((s) => `${s.label} (${s.count})`).join("; ")}`,
  ].join("\n");
}

export interface AssistantResult {
  answer: string;
  query?: string;
  chart?: { metric: ChartMetric; topN: number };
}

const SYSTEM_PROMPT = `You are the analysis assistant inside "Idea Network", a tool that visualizes an email network graph (people, threads, concepts, SOP/data references).

You will get a dataset digest, possibly some relevant message excerpts, and a user question. Respond with ONLY a JSON object, no markdown fences, matching:
{
  "answer": "<concise answer to the question, grounded in the digest and excerpts — quote or cite excerpts (sender, subject) when they answer the question>",
  "query": "<optional graph query to highlight relevant nodes>",
  "chart": { "metric": "<optional metric id>", "topN": <number 3-20> }
}

Query DSL (only include "query" when highlighting helps): free text matches node labels; filters: type:person|thread|concept|sop, from:<name>, to:<name>, with:<name>, concept:<term>, sop:<term>, text:<term> (full-text in message bodies), min-degree:<n>, min-count:<n>. Quote multi-word values: from:"walt thomas".

Chart metric ids (only include "chart" when the question is quantitative): ${CHART_METRICS.map((m) => m.id).join(", ")}.

Never invent people, threads, or numbers not present in the digest or excerpts.`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Assistant did not return JSON.");
  return raw.slice(start, end + 1);
}

export async function askAssistant(
  config: LlmConfig,
  dataset: Dataset,
  question: string,
  onToken?: (token: string) => void,
): Promise<AssistantResult> {
  const excerptBlock = formatExcerpts(retrieveMessages(dataset, question));
  const userContent = [
    `Dataset digest:\n${buildDatasetContext(dataset)}`,
    ...(excerptBlock ? [`Relevant message excerpts:\n${excerptBlock}`] : []),
    `Question: ${question}`,
  ].join("\n\n");

  const content = await streamChatCompletion(
    config,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    onToken,
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(content)) as Record<string, unknown>;
  } catch {
    // Model ignored the format — surface its text as the answer.
    return { answer: content.trim() };
  }

  const result: AssistantResult = {
    answer: typeof parsed.answer === "string" && parsed.answer ? parsed.answer : content.trim(),
  };
  if (typeof parsed.query === "string" && parsed.query.trim()) result.query = parsed.query.trim();
  const chart = parsed.chart as { metric?: unknown; topN?: unknown } | undefined;
  if (chart && isChartMetric(chart.metric)) {
    const topN = typeof chart.topN === "number" && chart.topN >= 3 && chart.topN <= 20 ? chart.topN : 10;
    result.chart = { metric: chart.metric, topN };
  }
  return result;
}
