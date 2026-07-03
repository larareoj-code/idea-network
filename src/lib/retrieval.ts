import type { Dataset, Message, ThreadMeta } from "./types";

/**
 * Fully local keyword retrieval over message bodies. Nothing here touches the
 * network — results are only ever embedded into the prompt sent to the user's
 * own configured LLM endpoint.
 */

export interface Citation {
  index: number;       // 1-based citation number in the text
  threadId: string;    // graph node id for the thread (thread:subject-hash)
  subject: string;
  from: string;
  snippet: string;     // first 120 chars of body
}

const STOPWORDS = new Set(
  (
    "a about above after again all also am an and any are as at be because been before being below between both but by " +
    "can could did do does doing down during each few for from further had has have having he her here hers him his how " +
    "i if in into is it its itself just me more most my no nor not of off on once only or other our out over own same " +
    "she should so some such than that the their them then there these they this those through to too under until up " +
    "very was we were what when where which while who whom why will with would you your yours " +
    "sent subject please thank thanks regards what's who's said say want know need get see one two three"
  ).split(/\s+/),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9'/-]{2,}/g) ?? []).filter(
    (t) => !STOPWORDS.has(t) && !/^\d+$/.test(t),
  );
}

export interface RetrievedExcerpt {
  messageId: string;
  sender: string;
  subject: string;
  date: string;
  excerpt: string;
  score: number;
}

const EXCERPT_RADIUS = 150;

function makeExcerpt(body: string, queryTerms: string[]): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let first = -1;
  for (const t of queryTerms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  if (first === -1) return flat.slice(0, EXCERPT_RADIUS * 2);
  const start = Math.max(0, first - EXCERPT_RADIUS);
  const end = Math.min(flat.length, first + EXCERPT_RADIUS);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/**
 * Score every message by term-frequency overlap with the query, normalized by
 * message length so a short precise match outranks a long body that happens to
 * mention one term. Returns the top-K with a citation-ready excerpt.
 */
export function retrieveMessages(dataset: Dataset, query: string, topK = 5): RetrievedExcerpt[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];

  const scored: { msg: Message; score: number }[] = [];
  for (const msg of dataset.messages) {
    if (msg.lowSignal) continue;
    const tokens = tokenize(`${msg.subject}\n${msg.body}`);
    if (tokens.length === 0) continue;
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

    let hits = 0;
    let matchedTerms = 0;
    for (const qt of queryTerms) {
      const tf = counts.get(qt);
      if (tf) {
        hits += tf;
        matchedTerms += 1;
      }
    }
    if (matchedTerms === 0) continue;
    scored.push({ msg, score: (matchedTerms * 2 + hits) / Math.sqrt(tokens.length) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ msg, score }) => ({
    messageId: msg.id,
    sender: msg.from?.displayName || msg.from?.key || "(unknown sender)",
    subject: msg.subject || "(no subject)",
    date: msg.date ? new Date(msg.date).toLocaleDateString() : (msg.approxDate ?? ""),
    excerpt: makeExcerpt(msg.body, queryTerms),
    score,
  }));
}

const MAX_EXCERPT_BLOCK_CHARS = 4000;

/** Plain-text block for the LLM prompt, capped so prompts stay reasonable. */
export function formatExcerpts(excerpts: RetrievedExcerpt[]): string {
  const lines: string[] = [];
  let size = 0;
  for (const e of excerpts) {
    const line = `- From ${e.sender}${e.date ? ` on ${e.date}` : ""}, subject "${e.subject}": ${e.excerpt}`;
    if (size + line.length > MAX_EXCERPT_BLOCK_CHARS) break;
    lines.push(line);
    size += line.length;
  }
  return lines.join("\n");
}

/**
 * Like formatExcerpts but tags each excerpt with [N] so the LLM can cite them,
 * and returns the resolved Citation objects alongside the text block.
 */
export function formatExcerptsWithCitations(
  excerpts: RetrievedExcerpt[],
  dataset: Dataset,
): { text: string; citations: Citation[] } {
  // Build a subject→threadId lookup from the graph
  const subjectToThreadId = new Map<string, string>();
  for (const node of dataset.graph.nodes) {
    if (node.type === "thread") {
      const meta = node.meta as ThreadMeta;
      subjectToThreadId.set(meta.subject.toLowerCase(), node.id);
    }
  }

  const lines: string[] = [];
  const citations: Citation[] = [];
  let size = 0;
  let index = 1;

  for (const e of excerpts) {
    const line = `[${index}] From ${e.sender}${e.date ? ` on ${e.date}` : ""}, subject "${e.subject}": ${e.excerpt}`;
    if (size + line.length > MAX_EXCERPT_BLOCK_CHARS) break;
    lines.push(line);
    size += line.length;

    const threadId = subjectToThreadId.get(e.subject.toLowerCase()) ?? `thread:${e.subject}`;
    citations.push({
      index,
      threadId,
      subject: e.subject,
      from: e.sender,
      snippet: e.excerpt.slice(0, 120),
    });
    index++;
  }

  return { text: lines.join("\n"), citations };
}
