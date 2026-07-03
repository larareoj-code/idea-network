import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../src/lib/parseOutlookCsv";
import { analyze } from "../src/lib/analyze";
import { detectCommunities } from "../src/lib/communities";
import { mergeDataset } from "../src/lib/dataset";
import { runQuery } from "../src/lib/query";
import { buildChart } from "../src/lib/charts";
import type { PersonMeta, ThreadMeta } from "../src/lib/types";

const DATA_DIR = join(__dirname, "..", "data");

const inbox = parseOutlookCsv(
  readFileSync(join(DATA_DIR, "Inbox Export.CSV"), "utf-8"),
  "Inbox Export.CSV",
);
const sent = parseOutlookCsv(readFileSync(join(DATA_DIR, "SentExport.CSV"), "utf-8"), "SentExport.CSV");
const messages = [...inbox, ...sent];

describe("community detection on real sample data", () => {
  const graph = analyze(messages);
  const personIds = (g: typeof graph) =>
    new Map(
      g.nodes.filter((n) => n.type === "person").map((n) => [n.id, (n.meta as PersonMeta).communityId]),
    );

  it("assigns every person a communityId", () => {
    const assignments = personIds(graph);
    expect(assignments.size).toBeGreaterThan(0);
    for (const cid of assignments.values()) expect(cid).toMatch(/^c\d+$/);
  });

  it("produces more than one community", () => {
    const distinct = new Set(personIds(graph).values());
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("is deterministic across runs on the same input", () => {
    const again = analyze(messages);
    expect(personIds(again)).toEqual(personIds(graph));
    expect(detectCommunities(graph)).toEqual(detectCommunities(graph));
  });
});

describe("community query filter and chart", () => {
  const dataset = mergeDataset(null, messages, "sample");

  it("community:1 selects only members of community c1 (with or without prefix)", () => {
    const ids = runQuery(dataset, "community:1")!;
    expect(ids.size).toBeGreaterThan(0);
    const byId = new Map(dataset.graph.nodes.map((n) => [n.id, n]));
    for (const id of ids) {
      const n = byId.get(id)!;
      expect((n.meta as PersonMeta | ThreadMeta).communityId).toBe("c1");
    }
    expect(runQuery(dataset, "community:c1")).toEqual(ids);
  });

  it("communities chart reports member counts sorted descending", () => {
    const spec = buildChart(dataset, "communities", 10);
    expect(spec.kind).toBe("bar");
    expect(spec.data.length).toBeGreaterThan(1);
    for (let i = 1; i < spec.data.length; i++) {
      expect(spec.data[i - 1].value).toBeGreaterThanOrEqual(spec.data[i].value);
    }
    const personCount = dataset.graph.nodes.filter((n) => n.type === "person").length;
    const total = spec.data.reduce((s, d) => s + d.value, 0);
    expect(total).toBeLessThanOrEqual(personCount);
  });
});
