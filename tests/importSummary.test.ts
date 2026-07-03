import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../src/lib/parseOutlookCsv";
import { mergeDataset } from "../src/lib/dataset";
import { buildImportSummary } from "../src/lib/importSummary";
import type { Message } from "../src/lib/types";

const DATA_DIR = join(__dirname, "..", "data");

function loadCsv(name: string): string {
  return readFileSync(join(DATA_DIR, name), "utf-8");
}

const inboxMessages = parseOutlookCsv(loadCsv("Inbox Export.CSV"), "Inbox Export.CSV");
const inboxItem = { name: "Inbox Export.CSV", messages: inboxMessages };

describe("buildImportSummary", () => {
  it("runs on the real Inbox Export.CSV without throwing", () => {
    const dataset = mergeDataset(null, inboxMessages, "Inbox Export.CSV");
    const summary = buildImportSummary([inboxItem], dataset, null);
    expect(summary.files).toHaveLength(1);
    expect(summary.files[0].name).toBe("Inbox Export.CSV");
    expect(summary.files[0].messageCount).toBe(inboxMessages.length);
    expect(summary.totalMessages).toBe(dataset.messages.length);
    expect(summary.totalNodes).toBe(dataset.graph.nodes.length);
    expect(summary.totalEdges).toBe(dataset.graph.links.length);
  });

  it("dedupeCount is 0 when merging fresh data into null prevDataset", () => {
    const dataset = mergeDataset(null, inboxMessages, "Inbox Export.CSV");
    const summary = buildImportSummary([inboxItem], dataset, null);
    expect(summary.dedupeCount).toBe(0);
  });

  it("dedupeCount > 0 when merging same data twice", () => {
    const first = mergeDataset(null, inboxMessages, "Inbox Export.CSV");
    const second = mergeDataset(first, inboxMessages, "Inbox Export.CSV");
    const summary = buildImportSummary([inboxItem], second, first);
    expect(summary.dedupeCount).toBeGreaterThan(0);
    expect(summary.dedupeCount).toBe(inboxMessages.length);
  });

  it("externalDomains is populated when recipients include different domains", () => {
    // Build synthetic messages with a clear internal sender and external recipient
    const internal: Message = {
      id: "msg-internal-1",
      subject: "Hello",
      body: "hi",
      from: { key: "alice", fullName: "Alice", displayName: "Alice", address: "alice@acme.com" },
      to: [{ key: "bob", fullName: "Bob", displayName: "Bob", address: "bob@external.org" }],
      cc: [],
      importance: "normal",
      categories: "",
      source: "test.csv",
      lowSignal: false,
    };
    const internal2: Message = {
      id: "msg-internal-2",
      subject: "Hello again",
      body: "hey",
      from: { key: "alice2", fullName: "Alice2", displayName: "Alice2", address: "alice2@acme.com" },
      to: [{ key: "carol", fullName: "Carol", displayName: "Carol", address: "carol@acme.com" }],
      cc: [],
      importance: "normal",
      categories: "",
      source: "test.csv",
      lowSignal: false,
    };
    const items = [{ name: "test.csv", messages: [internal, internal2] }];
    const dataset = mergeDataset(null, [internal, internal2], "test.csv");
    const summary = buildImportSummary(items, dataset, null);
    expect(summary.files[0].externalDomains).toContain("external.org");
    expect(summary.files[0].externalDomains).not.toContain("acme.com");
  });

  it("warnings array mentions undated messages when messages have no date field", () => {
    const noDate: Message = {
      id: "msg-no-date",
      subject: "No date",
      body: "body",
      from: { key: "sender", fullName: "Sender", displayName: "Sender", address: "sender@corp.com" },
      to: [],
      cc: [],
      importance: "normal",
      categories: "",
      source: "test.csv",
      lowSignal: false,
      // No date or approxDate
    };
    const withDate: Message = {
      id: "msg-with-date",
      subject: "Has date",
      body: "body",
      from: { key: "sender", fullName: "Sender", displayName: "Sender", address: "sender@corp.com" },
      to: [],
      cc: [],
      importance: "normal",
      categories: "",
      source: "test.csv",
      lowSignal: false,
      date: "2024-01-15T10:00:00.000Z",
    };
    const items = [{ name: "test.csv", messages: [noDate, withDate] }];
    const dataset = mergeDataset(null, [noDate, withDate], "test.csv");
    const summary = buildImportSummary(items, dataset, null);
    const w = summary.files[0].warnings;
    expect(w.some((s) => s.includes("missing date"))).toBe(true);
  });

  it("parseErrors are passed through to summary", () => {
    const dataset = mergeDataset(null, inboxMessages, "Inbox Export.CSV");
    const summary = buildImportSummary([inboxItem], dataset, null, ["file.pst: parse error"]);
    expect(summary.parseErrors).toContain("file.pst: parse error");
  });
});
