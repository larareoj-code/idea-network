import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOutlookCsv } from "../../src/lib/parseOutlookCsv";
import { mergeDataset } from "../../src/lib/dataset";
import { runQuery } from "../../src/lib/query";

const ROOT = join(__dirname, "..", "..");
const inboxCsv = readFileSync(join(ROOT, "public/demo-samples/inbox.csv"), "utf-8");
const sentCsv = readFileSync(join(ROOT, "public/demo-samples/sent.csv"), "utf-8");
const msgs = parseOutlookCsv(inboxCsv, "inbox.csv");
const sent = parseOutlookCsv(sentCsv, "sent.csv");
const dataset = mergeDataset(mergeDataset(null, msgs, "inbox.csv"), sent, "sent.csv")!;
const byId = new Map(dataset.graph.nodes.map((n) => [n.id, n]));

describe("Query DSL regression (demo data)", () => {
  it("empty query returns null", () => {
    expect(runQuery(dataset, "")).toBeNull();
    expect(runQuery(dataset, "   ")).toBeNull();
  });

  it("type:person returns only person nodes", () => {
    const ids = runQuery(dataset, "type:person")!;
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(byId.get(id)!.type).toBe("person");
  });

  it("type:thread returns only thread nodes", () => {
    const ids = runQuery(dataset, "type:thread")!;
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(byId.get(id)!.type).toBe("thread");
  });

  it("min-degree:2 returns nodes with degree >= 2", () => {
    const ids = runQuery(dataset, "min-degree:2")!;
    for (const id of ids) expect(byId.get(id)!.degree).toBeGreaterThanOrEqual(2);
  });

  it("from: matches a sender who sent messages", () => {
    const sender = dataset.graph.nodes.find(
      (n) => n.type === "person" && (n.meta as { sentCount: number }).sentCount > 0,
    );
    if (!sender) return; // no senders in demo = skip
    const ids = runQuery(dataset, `from:"${sender.label}"`)!;
    expect(ids.has(sender.id)).toBe(true);
  });

  it("text: search returns at least one result when word exists", () => {
    const word = dataset.messages
      .flatMap((m) => m.body.split(/\s+/))
      .find((w) => w.length >= 5 && /^[a-z]+$/i.test(w));
    if (!word) return;
    const ids = runQuery(dataset, `text:${word.toLowerCase()}`)!;
    expect(ids.size).toBeGreaterThan(0);
  });

  it("unknown type filter returns empty set not null", () => {
    const ids = runQuery(dataset, "type:unknown");
    expect(ids).not.toBeNull();
    expect(ids!.size).toBe(0);
  });

  it("no-hit free text returns empty set not null", () => {
    const ids = runQuery(dataset, "zzz-no-match-xyzzy-9999");
    expect(ids).not.toBeNull();
    expect(ids!.size).toBe(0);
  });
});
