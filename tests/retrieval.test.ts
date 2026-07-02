import { describe, expect, it } from "vitest";
import { formatExcerpts, retrieveMessages } from "../src/lib/retrieval";
import type { Dataset, Message, Participant } from "../src/lib/types";

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

function dataset(messages: Message[]): Dataset {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: [{ name: "test", messageCount: messages.length }],
    messages,
    graph: { nodes: [], links: [] },
  };
}

describe("retrieveMessages", () => {
  it("ranks a message containing the query term above one that does not", () => {
    const ds = dataset([
      msg("m1", "Alice Smith", "Weekly status", "Routine updates about scheduling and leave requests."),
      msg("m2", "Brent Jones", "Rotor head inspection", "The swashplate showed abnormal wear during the phase inspection."),
    ]);
    const hits = retrieveMessages(ds, "what did Brent say about the swashplate");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].messageId).toBe("m2");
    expect(hits[0].sender).toBe("Brent Jones");
  });

  it("normalizes by length so a short precise match outranks a long body with one mention", () => {
    const filler = Array.from({ length: 400 }, (_, i) => `filler${i} logistics inventory paperwork`).join(" ");
    const ds = dataset([
      msg("long", "Carl Long", "Quarterly roundup", `${filler} swashplate ${filler}`),
      msg("short", "Dana Short", "Swashplate torque values", "Swashplate torque values attached for the swashplate replacement."),
    ]);
    const hits = retrieveMessages(ds, "swashplate torque");
    expect(hits[0].messageId).toBe("short");
  });

  it("respects topK and skips low-signal messages", () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      msg(`m${i}`, `Sender ${i}`, "Gearbox report", `Gearbox chip detector notes, item ${i}.`),
    );
    messages.push(msg("teams", "Teams Bot", "Gearbox channel", "Gearbox gearbox gearbox.", { lowSignal: true }));
    const hits = retrieveMessages(dataset(messages), "gearbox", 5);
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.messageId !== "teams")).toBe(true);
  });

  it("returns nothing for a stopword-only query", () => {
    const ds = dataset([msg("m1", "Alice Smith", "Anything", "Anything at all.")]);
    expect(retrieveMessages(ds, "what did they say about the")).toEqual([]);
  });

  it("centers the excerpt on the first matched term in a long body", () => {
    const before = Array.from({ length: 200 }, (_, i) => `pad${i}`).join(" ");
    const ds = dataset([msg("m1", "Brent Jones", "Maintenance", `${before} the swashplate assembly needs replacement soon.`)]);
    const [hit] = retrieveMessages(ds, "swashplate");
    expect(hit.excerpt.toLowerCase()).toContain("swashplate");
    expect(hit.excerpt.startsWith("…")).toBe(true);
  });
});

describe("formatExcerpts", () => {
  it("includes sender and subject for citation and caps total size", () => {
    const big = "x".repeat(1500);
    const ds = dataset(
      Array.from({ length: 10 }, (_, i) => msg(`m${i}`, `Sender ${i}`, `Subject ${i}`, `swashplate ${big}`)),
    );
    const block = formatExcerpts(retrieveMessages(ds, "swashplate", 10));
    expect(block).toContain("From Sender");
    expect(block).toContain('subject "Subject');
    expect(block.length).toBeLessThanOrEqual(4500);
  });
});
