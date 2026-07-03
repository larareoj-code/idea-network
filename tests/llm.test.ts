import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../src/lib/parseOutlookCsv";
import { mergeDataset } from "../src/lib/dataset";
import { retrieveMessages, formatExcerptsWithCitations } from "../src/lib/retrieval";
import { buildGraphSummary } from "../src/lib/llm";
import type { Dataset, GraphLink, GraphNode, Message, Participant } from "../src/lib/types";

const DEMO_DIR = join(__dirname, "..", "public", "demo-samples");

function loadDemoDataset(): Dataset {
  const inbox = parseOutlookCsv(readFileSync(join(DEMO_DIR, "inbox.csv"), "utf-8"), "inbox.csv");
  const sent = parseOutlookCsv(readFileSync(join(DEMO_DIR, "sent.csv"), "utf-8"), "sent.csv");
  return mergeDataset(null, [...inbox, ...sent], "demo");
}

// Minimal helpers for unit tests that don't need real data

function person(name: string): Participant {
  const key = name.toLowerCase().replace(/\s+/g, ".");
  return { key, fullName: name, displayName: name, address: `${key}@example.mil` };
}

function msg(id: string, from: string, subject: string, body: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    subject,
    body,
    from: person(from),
    to: [],
    cc: [],
    importance: "",
    categories: "",
    source: "test",
    lowSignal: false,
    ...extra,
  };
}

function emptyDataset(messages: Message[]): Dataset {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: [{ name: "test", messageCount: messages.length }],
    messages,
    graph: { nodes: [], links: [] },
  };
}

// ── D5.1: retrieveMessages returns { messages, scores } shape ─────────────────
// Note: retrieveMessages returns RetrievedExcerpt[] (not { messages, scores }).
// The spec's requested shape was absorbed into RetrievedExcerpt. We verify the
// object shape contains the expected fields including score.

describe("retrieveMessages — result shape", () => {
  it("returns an array of objects with messageId and score fields", () => {
    const ds = emptyDataset([
      msg("m1", "Alice Smith", "Hydraulic leak", "The hydraulic fluid leak was found near the actuator assembly."),
    ]);
    const results = retrieveMessages(ds, "hydraulic leak");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.messageId).toBe("string");
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it("returns empty array gracefully when dataset has zero messages", () => {
    const ds = emptyDataset([]);
    const results = retrieveMessages(ds, "hydraulic");
    expect(results).toEqual([]);
  });

  it("returns empty array gracefully when query terms are all stopwords", () => {
    const ds = emptyDataset([msg("m1", "Bob", "Test", "Something about this and that.")]);
    const results = retrieveMessages(ds, "what did they say");
    expect(results).toEqual([]);
  });
});

// ── D5.2: formatExcerptsWithCitations produces [N]-tagged text and citations ──

describe("formatExcerptsWithCitations", () => {
  it("produces [1]-tagged text for the first excerpt", () => {
    const ds = emptyDataset([
      msg("m1", "Alice Smith", "Rotor inspection", "The swashplate showed wear during the phase inspection."),
    ]);
    const excerpts = retrieveMessages(ds, "swashplate inspection");
    const { text, citations } = formatExcerptsWithCitations(excerpts, ds);
    expect(text).toContain("[1]");
    expect(citations.length).toBe(1);
    expect(citations[0].index).toBe(1);
  });

  it("numbers citations sequentially", () => {
    const messages = [
      msg("m1", "Alice", "Gearbox report", "Gearbox chip detector found metal particles."),
      msg("m2", "Bob", "Gearbox followup", "Additional gearbox inspection complete."),
      msg("m3", "Carol", "Gearbox parts", "Gearbox parts ordered for replacement."),
    ];
    const ds = emptyDataset(messages);
    const excerpts = retrieveMessages(ds, "gearbox", 3);
    const { text, citations } = formatExcerptsWithCitations(excerpts, ds);
    expect(citations.map((c) => c.index)).toEqual([1, 2, 3]);
    expect(text).toContain("[1]");
    expect(text).toContain("[2]");
    expect(text).toContain("[3]");
  });

  it("citations have correct subject, from, and snippet fields", () => {
    const ds = emptyDataset([
      msg("m1", "Walt Thomas", "Engine oil analysis", "The engine oil sample showed elevated iron content levels in the analysis."),
    ]);
    const excerpts = retrieveMessages(ds, "engine oil analysis");
    const { citations } = formatExcerptsWithCitations(excerpts, ds);
    expect(citations.length).toBeGreaterThan(0);
    const c = citations[0];
    expect(c.subject).toBe("Engine oil analysis");
    expect(c.from).toBe("Walt Thomas");
    expect(typeof c.snippet).toBe("string");
    expect(c.snippet.length).toBeLessThanOrEqual(120);
  });

  it("citation threadId falls back gracefully when no matching graph node exists", () => {
    const ds = emptyDataset([
      msg("m1", "Alice", "Unique subject XYZ", "Body about unique subject XYZ content here."),
    ]);
    const excerpts = retrieveMessages(ds, "unique subject");
    const { citations } = formatExcerptsWithCitations(excerpts, ds);
    expect(citations.length).toBeGreaterThan(0);
    // No thread node in graph, so falls back to "thread:" prefix
    expect(citations[0].threadId).toMatch(/^thread:/);
  });

  it("returns empty text and citations for empty excerpts", () => {
    const ds = emptyDataset([]);
    const { text, citations } = formatExcerptsWithCitations([], ds);
    expect(text).toBe("");
    expect(citations).toEqual([]);
  });
});

// ── D5.3: citation threadId resolves when a matching thread node exists ────────

describe("formatExcerptsWithCitations — threadId resolution", () => {
  it("resolves threadId to graph node id when a thread node exists for the subject", () => {
    const messages = [
      msg("m1", "Dana Short", "Weekly safety brief", "Safety brief content for this week."),
    ];
    const ds = emptyDataset(messages);
    // Inject a fake thread node with a matching subject into the graph
    const threadNode: GraphNode = {
      id: "thread:abc123",
      type: "thread",
      label: "Weekly safety brief",
      count: 1,
      degree: 1,
      meta: { kind: "thread", subject: "Weekly safety brief", messageIds: ["m1"], participantKeys: [], approxDates: [], lowSignal: false },
    };
    ds.graph.nodes = [threadNode];

    const excerpts = retrieveMessages(ds, "safety brief");
    const { citations } = formatExcerptsWithCitations(excerpts, ds);
    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0].threadId).toBe("thread:abc123");
  });
});

// ── D5.4: buildGraphSummary produces a non-empty string ──────────────────────

describe("buildGraphSummary", () => {
  it("produces a non-empty string from a small graph", () => {
    const nodes: GraphNode[] = [
      { id: "p1", type: "person", label: "Alice Smith", count: 5, degree: 3, meta: { kind: "person", addresses: [], sentCount: 5, receivedCount: 2, messageIds: [] } },
      { id: "p2", type: "person", label: "Bob Jones", count: 3, degree: 2, meta: { kind: "person", addresses: [], sentCount: 3, receivedCount: 1, messageIds: [] } },
      { id: "t1", type: "thread", label: "Gearbox report", count: 4, degree: 2, meta: { kind: "thread", subject: "Gearbox report", messageIds: [], participantKeys: [], approxDates: [], lowSignal: false } },
      { id: "c1", type: "concept", label: "maintenance", count: 8, degree: 4, meta: { kind: "concept", threadIds: [], occurrences: 8 } },
    ];
    const links: GraphLink[] = [
      { source: "p1", target: "t1", type: "participated", weight: 3 },
      { source: "p2", target: "t1", type: "participated", weight: 2 },
      { source: "t1", target: "c1", type: "mentions", weight: 4 },
    ];
    const summary = buildGraphSummary(nodes, links);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("Visible graph:");
    expect(summary).toContain("person");
    expect(summary).toContain("thread");
  });

  it("returns a string (not empty) for an empty graph", () => {
    const summary = buildGraphSummary([], []);
    expect(typeof summary).toBe("string");
    expect(summary).toContain("0 nodes");
  });
});

// ── D5.5: demo-samples integration ───────────────────────────────────────────

describe("demo-samples integration", () => {
  it("loads demo dataset and retrieves scored results", () => {
    const ds = loadDemoDataset();
    expect(ds.messages.length).toBeGreaterThan(0);
    const results = retrieveMessages(ds, "maintenance report");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("formatExcerptsWithCitations works on demo dataset results", () => {
    const ds = loadDemoDataset();
    const excerpts = retrieveMessages(ds, "inspection");
    const { text, citations } = formatExcerptsWithCitations(excerpts, ds);
    expect(text.length).toBeGreaterThan(0);
    expect(citations.length).toBeGreaterThan(0);
    for (const c of citations) {
      expect(c.index).toBeGreaterThan(0);
      expect(typeof c.subject).toBe("string");
      expect(typeof c.from).toBe("string");
      expect(c.snippet.length).toBeLessThanOrEqual(120);
    }
  });
});
