import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../../src/lib/parseOutlookCsv";
import { mergeDataset } from "../../src/lib/dataset";

const ROOT = join(__dirname, "..", "..");
const inboxCsv = readFileSync(join(ROOT, "public/demo-samples/inbox.csv"), "utf-8");
const sentCsv = readFileSync(join(ROOT, "public/demo-samples/sent.csv"), "utf-8");

describe("CSV parser regression (demo data)", () => {
  it("inbox parses to an array of messages with required fields", () => {
    const msgs = parseOutlookCsv(inboxCsv, "inbox.csv");
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.subject).toBe("string");
      expect(typeof m.body).toBe("string");
      expect(Array.isArray(m.to)).toBe(true);
      if (m.from !== null) {
        expect(typeof m.from.key).toBe("string");
        expect(typeof m.from.address).toBe("string");
        expect(typeof m.from.displayName).toBe("string");
      }
    }
  });

  it("sent parses to an array of messages with required fields", () => {
    const msgs = parseOutlookCsv(sentCsv, "sent.csv");
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  it("mergeDataset produces a valid graph from inbox", () => {
    const msgs = parseOutlookCsv(inboxCsv, "inbox.csv");
    const ds = mergeDataset(null, msgs, "inbox.csv");
    expect(ds).not.toBeNull();
    expect(ds!.messages.length).toBeGreaterThan(0);
    expect(ds!.graph.nodes.length).toBeGreaterThan(0);
    for (const n of ds!.graph.nodes) {
      expect(typeof n.id).toBe("string");
      expect(["person", "thread", "concept", "sop"]).toContain(n.type);
      expect(typeof n.label).toBe("string");
      expect(n.degree).toBeGreaterThanOrEqual(0);
    }
    for (const l of ds!.graph.links) {
      expect(typeof l.source).toBe("string");
      expect(typeof l.target).toBe("string");
      expect(typeof l.type).toBe("string");
      expect(l.weight).toBeGreaterThanOrEqual(1);
    }
  });

  it("merging same file twice deduplicates messages", () => {
    const msgs = parseOutlookCsv(inboxCsv, "inbox.csv");
    const once = mergeDataset(null, msgs, "inbox.csv");
    const twice = mergeDataset(once, msgs, "inbox.csv");
    expect(twice!.messages.length).toBe(once!.messages.length);
  });

  it("merging inbox and sent produces more nodes than inbox alone", () => {
    const inbox = parseOutlookCsv(inboxCsv, "inbox.csv");
    const sent = parseOutlookCsv(sentCsv, "sent.csv");
    const inboxOnly = mergeDataset(null, inbox, "inbox.csv");
    const both = mergeDataset(inboxOnly, sent, "sent.csv");
    expect(both!.graph.nodes.length).toBeGreaterThanOrEqual(inboxOnly!.graph.nodes.length);
  });
});
