import { describe, expect, it } from "vitest";
import { buildChart } from "../src/lib/charts";
import type { Dataset, GraphNode, GraphLink, Message } from "../src/lib/types";

function makeDataset(nodes: GraphNode[], links: GraphLink[] = [], messages: Message[] = []): Dataset {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: [],
    messages,
    graph: { nodes, links },
  };
}

const threadNode = (id: string, subject: string, messageIds: string[], participantKeys: string[] = []): GraphNode => ({
  id,
  type: "thread",
  label: subject,
  count: messageIds.length,
  degree: participantKeys.length,
  meta: {
    kind: "thread",
    subject,
    messageIds,
    participantKeys,
    approxDates: [],
    lowSignal: false,
  },
});

const sopNode = (id: string, label: string, degree: number): GraphNode => ({
  id,
  type: "sop",
  label,
  count: degree,
  degree,
  meta: { kind: "sop", category: "general", threadIds: [] },
});

const conceptNode = (id: string, label: string, threadIds: string[] = []): GraphNode => ({
  id,
  type: "concept",
  label,
  count: threadIds.length || 1,
  degree: threadIds.length,
  meta: { kind: "concept", threadIds, occurrences: threadIds.length || 1 },
});

const msg = (id: string, messageId?: string, inReplyTo?: string, date?: string): Message => ({
  id,
  subject: "Test",
  body: "",
  from: null,
  to: [],
  cc: [],
  importance: "",
  categories: "",
  source: "test",
  lowSignal: false,
  messageId,
  inReplyTo,
  date,
});

describe("unresolved-threads metric", () => {
  it("returns empty when no threads", () => {
    const ds = makeDataset([]);
    const spec = buildChart(ds, "unresolved-threads");
    expect(spec.title).toBe("Unresolved threads");
    expect(spec.data).toHaveLength(0);
  });

  it("marks thread as unresolved when no reply exists", () => {
    const m1 = msg("m1", "msg-id-1");
    const t1 = threadNode("t1", "No reply thread", ["m1"]);
    const ds = makeDataset([t1], [], [m1]);
    const spec = buildChart(ds, "unresolved-threads");
    expect(spec.data.some((d) => d.nodeId === "t1")).toBe(true);
  });

  it("does not mark thread as unresolved when a reply exists", () => {
    const m1 = msg("m1", "msg-id-1");
    const m2 = msg("m2", "msg-id-2", "msg-id-1");
    const t1 = threadNode("t1", "Replied thread", ["m1", "m2"]);
    const ds = makeDataset([t1], [], [m1, m2]);
    const spec = buildChart(ds, "unresolved-threads");
    expect(spec.data.some((d) => d.nodeId === "t1")).toBe(false);
  });
});

describe("sop-by-degree metric", () => {
  it("returns empty when no sop nodes", () => {
    const ds = makeDataset([]);
    const spec = buildChart(ds, "sop-by-degree");
    expect(spec.data).toHaveLength(0);
  });

  it("ranks SOPs by degree descending", () => {
    const s1 = sopNode("sop1", "DSR", 3);
    const s2 = sopNode("sop2", "QMS", 7);
    const s3 = sopNode("sop3", "HPRD", 1);
    const ds = makeDataset([s1, s2, s3]);
    const spec = buildChart(ds, "sop-by-degree", 10);
    expect(spec.data[0].label).toBe("QMS");
    expect(spec.data[0].value).toBe(7);
    expect(spec.data[1].label).toBe("DSR");
    expect(spec.data[2].label).toBe("HPRD");
  });

  it("populates nodeId on each datum", () => {
    const s1 = sopNode("sop1", "DSR", 3);
    const ds = makeDataset([s1]);
    const spec = buildChart(ds, "sop-by-degree");
    expect(spec.data[0].nodeId).toBe("sop1");
  });
});

describe("concept-drift metric", () => {
  it("returns empty data with note when no dated messages", () => {
    const c1 = conceptNode("c1", "phase", ["t1"]);
    const t1 = threadNode("t1", "Thread 1", ["m1"]);
    const m1 = msg("m1"); // no date
    const ds = makeDataset([c1, t1], [], [m1]);
    const spec = buildChart(ds, "concept-drift");
    expect(spec.data).toHaveLength(0);
    expect(spec.title).toContain("no dated messages");
  });

  it("groups concepts by month of first appearance", () => {
    const t1 = threadNode("t1", "Thread Jan", ["m1"]);
    const t2 = threadNode("t2", "Thread Feb", ["m2"]);
    const c1 = conceptNode("c1", "alpha", ["t1"]);
    const c2 = conceptNode("c2", "beta", ["t1"]);
    const c3 = conceptNode("c3", "gamma", ["t2"]);
    const m1 = msg("m1", undefined, undefined, "2026-01-15T10:00:00Z");
    const m2 = msg("m2", undefined, undefined, "2026-02-10T10:00:00Z");
    const ds = makeDataset([t1, t2, c1, c2, c3], [], [m1, m2]);
    const spec = buildChart(ds, "concept-drift");
    expect(spec.data.length).toBeGreaterThan(0);
    const jan = spec.data.find((d) => d.label === "2026-01");
    const feb = spec.data.find((d) => d.label === "2026-02");
    expect(jan?.value).toBe(2);
    expect(feb?.value).toBe(1);
  });
});
