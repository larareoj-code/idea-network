import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../../src/lib/parseOutlookCsv";
import { mergeDataset } from "../../src/lib/dataset";
import { generateReport } from "../../src/lib/report";

const ROOT = join(__dirname, "..", "..");
const inbox = parseOutlookCsv(readFileSync(join(ROOT, "public/demo-samples/inbox.csv"), "utf-8"), "inbox.csv");
const sent = parseOutlookCsv(readFileSync(join(ROOT, "public/demo-samples/sent.csv"), "utf-8"), "sent.csv");
const dataset = mergeDataset(mergeDataset(null, inbox, "inbox.csv"), sent, "sent.csv")!;

describe("Report export regression", () => {
  it("generateReport returns a non-empty string", () => {
    const out = generateReport(dataset, []);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("output contains expected headings", () => {
    const out = generateReport(dataset, []);
    expect(out).toContain("# Idea Network Report");
    expect(out).toContain("## Summary");
  });

  it("output contains privacy note", () => {
    const out = generateReport(dataset, []);
    expect(out.toLowerCase()).toContain("privacy");
  });

  it("output does not contain full message bodies", () => {
    const out = generateReport(dataset, []);
    // Bodies are typically long (>80 chars); verify none appear verbatim
    for (const m of dataset.messages) {
      if (m.body.length > 80) {
        expect(out).not.toContain(m.body);
      }
    }
  });
});
