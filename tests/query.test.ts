import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../src/lib/parseOutlookCsv";
import { mergeDataset } from "../src/lib/dataset";
import { parseQuery, runQuery } from "../src/lib/query";
import { buildChart, CHART_METRICS } from "../src/lib/charts";

const DATA_DIR = join(__dirname, "..", "data");

const inbox = parseOutlookCsv(readFileSync(join(DATA_DIR, "Inbox Export.CSV"), "utf-8"), "inbox.csv");
const dataset = mergeDataset(null, inbox, "inbox.csv");

describe("query DSL", () => {
  it("parses filters, quoted values, and terms", () => {
    const q = parseQuery('from:"walt thomas" type:thread phase "hyd flush"');
    expect(q.filters).toEqual([
      { field: "from", value: "walt thomas" },
      { field: "type", value: "thread" },
    ]);
    expect(q.terms).toEqual(["phase", "hyd flush"]);
  });

  it("returns null for an empty query", () => {
    expect(runQuery(dataset, "")).toBeNull();
    expect(runQuery(dataset, "   ")).toBeNull();
  });

  it("type: restricts to a node type", () => {
    const ids = runQuery(dataset, "type:person")!;
    expect(ids.size).toBeGreaterThan(0);
    const byId = new Map(dataset.graph.nodes.map((n) => [n.id, n]));
    for (const id of ids) expect(byId.get(id)!.type).toBe("person");
  });

  it("free text matches node labels", () => {
    const ids = runQuery(dataset, "dsr")!;
    expect(ids.size).toBeGreaterThan(0);
  });

  it("from: matches senders and their threads", () => {
    const sender = dataset.graph.nodes.find(
      (n) => n.type === "person" && (n.meta as { sentCount: number }).sentCount > 0,
    )!;
    const ids = runQuery(dataset, `from:"${sender.label}"`)!;
    expect(ids.has(sender.id)).toBe(true);
    const byId = new Map(dataset.graph.nodes.map((n) => [n.id, n]));
    expect([...ids].some((id) => byId.get(id)!.type === "thread")).toBe(true);
  });

  it("filters AND together", () => {
    const all = runQuery(dataset, "type:thread")!;
    const narrowed = runQuery(dataset, "type:thread min-count:2")!;
    expect(narrowed.size).toBeLessThanOrEqual(all.size);
    for (const id of narrowed) expect(all.has(id)).toBe(true);
  });

  it("returns an empty set (not null) for a query with no hits", () => {
    const ids = runQuery(dataset, "zzz-no-such-node-zzz");
    expect(ids).not.toBeNull();
    expect(ids!.size).toBe(0);
  });
});

describe("charts", () => {
  it("builds every metric without crashing and respects topN", () => {
    for (const m of CHART_METRICS) {
      const spec = buildChart(dataset, m.id, 5);
      expect(spec.title.length).toBeGreaterThan(0);
      expect(spec.data.length).toBeLessThanOrEqual(m.id === "type-distribution" ? 4 : 5);
      for (const d of spec.data) expect(d.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("top-senders is sorted descending with node ids", () => {
    const spec = buildChart(dataset, "top-senders", 10);
    expect(spec.data.length).toBeGreaterThan(0);
    for (let i = 1; i < spec.data.length; i++) {
      expect(spec.data[i - 1].value).toBeGreaterThanOrEqual(spec.data[i].value);
    }
    for (const d of spec.data) expect(d.nodeId).toMatch(/^person:/);
  });

  it("type-distribution totals match node count", () => {
    const spec = buildChart(dataset, "type-distribution");
    const total = spec.data.reduce((s, d) => s + d.value, 0);
    expect(total).toBe(dataset.graph.nodes.length);
  });
});
