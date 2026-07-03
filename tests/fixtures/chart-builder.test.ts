import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../../src/lib/parseOutlookCsv";
import { mergeDataset } from "../../src/lib/dataset";
import { buildChart, CHART_METRICS } from "../../src/lib/charts";

const ROOT = join(__dirname, "..", "..");
const inbox = parseOutlookCsv(readFileSync(join(ROOT, "public/demo-samples/inbox.csv"), "utf-8"), "inbox.csv");
const sent = parseOutlookCsv(readFileSync(join(ROOT, "public/demo-samples/sent.csv"), "utf-8"), "sent.csv");
const dataset = mergeDataset(mergeDataset(null, inbox, "inbox.csv"), sent, "sent.csv")!;

describe("Chart builder regression (demo data)", () => {
  it("every metric builds without throwing", () => {
    for (const m of CHART_METRICS) {
      expect(() => buildChart(dataset, m.id, 5)).not.toThrow();
    }
  });

  it("top-senders data items have nodeId starting with person:", () => {
    const spec = buildChart(dataset, "top-senders", 10);
    for (const d of spec.data) {
      expect(d.nodeId).toMatch(/^person:/);
    }
  });

  it("type-distribution totals equal node count", () => {
    const spec = buildChart(dataset, "type-distribution");
    const total = spec.data.reduce((s, d) => s + d.value, 0);
    expect(total).toBe(dataset.graph.nodes.length);
  });

  it("busiest-threads is sorted descending", () => {
    const spec = buildChart(dataset, "busiest-threads", 10);
    for (let i = 1; i < spec.data.length; i++) {
      expect(spec.data[i - 1].value).toBeGreaterThanOrEqual(spec.data[i].value);
    }
  });

  it("sop-mentions returns an array (may be empty on demo data)", () => {
    const spec = buildChart(dataset, "sop-mentions", 10);
    expect(Array.isArray(spec.data)).toBe(true);
  });

  it("every metric produces a non-empty title", () => {
    for (const m of CHART_METRICS) {
      const spec = buildChart(dataset, m.id, 5);
      expect(spec.title.length).toBeGreaterThan(0);
    }
  });
});
