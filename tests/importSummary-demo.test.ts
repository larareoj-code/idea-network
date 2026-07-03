import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../src/lib/parseOutlookCsv";
import { mergeDataset } from "../src/lib/dataset";
import { buildImportSummary } from "../src/lib/importSummary";

const ROOT = join(__dirname, "..");
const inboxMsgs = parseOutlookCsv(
  readFileSync(join(ROOT, "public/demo-samples/inbox.csv"), "utf-8"),
  "inbox.csv",
);
const dataset = mergeDataset(null, inboxMsgs, "inbox.csv")!;

const items = [{ name: "inbox.csv", messages: inboxMsgs }];

describe("importSummary (demo data)", () => {
  it("produces a summary with one file entry", () => {
    const summary = buildImportSummary(items, dataset, null, []);
    expect(summary.files).toHaveLength(1);
  });

  it("totalMessages > 0", () => {
    const summary = buildImportSummary(items, dataset, null, []);
    expect(summary.totalMessages).toBeGreaterThan(0);
  });

  it("dedupeCount is 0 when prevDataset is null", () => {
    const summary = buildImportSummary(items, dataset, null, []);
    expect(summary.dedupeCount).toBe(0);
  });

  it("dedupeCount > 0 when merging same data twice", () => {
    const twice = mergeDataset(dataset, inboxMsgs, "inbox.csv")!;
    const summary = buildImportSummary(items, twice, dataset, []);
    expect(summary.dedupeCount).toBeGreaterThan(0);
  });

  it("files[0].warnings is an array", () => {
    const summary = buildImportSummary(items, dataset, null, []);
    expect(Array.isArray(summary.files[0].warnings)).toBe(true);
  });

  it("totalNodes and totalEdges match dataset", () => {
    const summary = buildImportSummary(items, dataset, null, []);
    expect(summary.totalNodes).toBe(dataset.graph.nodes.length);
    expect(summary.totalEdges).toBe(dataset.graph.links.length);
  });
});
