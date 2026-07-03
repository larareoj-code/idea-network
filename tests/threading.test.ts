import { describe, expect, it } from "vitest";
import { parseEml } from "../src/lib/parseEml";
import { analyze } from "../src/lib/analyze";
import { assignThreads } from "../src/lib/threading";
import type { Message, ThreadMeta } from "../src/lib/types";

function eml(headers: Record<string, string>, body: string): string {
  return (
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n") + `\r\n\r\n${body}`
  );
}

function one(text: string, source: string): Message {
  const msgs = parseEml(text, source);
  expect(msgs).toHaveLength(1);
  return msgs[0];
}

const chainA = one(
  eml(
    {
      From: "Alice Smith <alice@unit.mil>",
      To: "Bob Jones <bob@unit.mil>",
      Subject: "Gearbox inspection findings",
      "Message-ID": "<m1@unit.mil>",
      Date: "Mon, 1 Jun 2026 10:00:00 +0000",
    },
    "Initial findings attached for review.",
  ),
  "a.eml",
);

const chainB = one(
  eml(
    {
      From: "Bob Jones <bob@unit.mil>",
      To: "Alice Smith <alice@unit.mil>",
      Subject: "Totally different subject now",
      "Message-ID": "<m2@unit.mil>",
      "In-Reply-To": "<m1@unit.mil>",
      Date: "Mon, 1 Jun 2026 11:00:00 +0000",
    },
    "Replying with an edited subject line.",
  ),
  "b.eml",
);

const chainC = one(
  eml(
    {
      From: "Carol White <carol@unit.mil>",
      To: "Alice Smith <alice@unit.mil>",
      Subject: "Third subject variant",
      "Message-ID": "<m3@unit.mil>",
      References: "<m1@unit.mil> <m2@unit.mil>",
      Date: "Mon, 1 Jun 2026 12:00:00 +0000",
    },
    "Chiming in via the references chain.",
  ),
  "c.eml",
);

describe("reply-header extraction (.eml)", () => {
  it("parses Message-ID, In-Reply-To, and References without brackets", () => {
    expect(chainA.messageId).toBe("m1@unit.mil");
    expect(chainA.inReplyTo).toBeUndefined();
    expect(chainA.references).toBeUndefined();
    expect(chainB.inReplyTo).toBe("m1@unit.mil");
    expect(chainC.references).toEqual(["m1@unit.mil", "m2@unit.mil"]);
  });
});

describe("header-based thread reconstruction", () => {
  it("groups a reply chain with edited subjects into one thread", () => {
    const graph = analyze([chainA, chainB, chainC]);
    const threads = graph.nodes.filter((n) => n.type === "thread");
    expect(threads).toHaveLength(1);
    const meta = threads[0].meta as ThreadMeta;
    expect(meta.messageIds).toEqual([chainA.id, chainB.id, chainC.id]);
  });

  it("uses a deterministic component id independent of input order", () => {
    const forward = assignThreads([chainA, chainB, chainC]);
    const reversed = assignThreads([chainC, chainB, chainA]);
    expect(forward.get(chainA.id)).toBe("thread:rfc:m1@unit.mil");
    expect(reversed.get(chainA.id)).toBe("thread:rfc:m1@unit.mil");
    expect(forward.get(chainB.id)).toBe(forward.get(chainA.id));
    expect(forward.get(chainC.id)).toBe(forward.get(chainA.id));
  });

  it("joins two replies to a common ancestor that is missing from the dataset", () => {
    const graph = analyze([chainB, chainC]);
    const threads = graph.nodes.filter((n) => n.type === "thread");
    expect(threads).toHaveLength(1);
  });

  it("does not force-merge same-subject messages with no header linkage and no shared participants", () => {
    const d = one(
      eml(
        {
          From: "Dave Green <dave@alpha.mil>",
          To: "Erin Black <erin@alpha.mil>",
          Subject: "Status update",
          "Message-ID": "<m10@alpha.mil>",
        },
        "Alpha team status.",
      ),
      "d.eml",
    );
    const e = one(
      eml(
        {
          From: "Frank Gray <frank@bravo.mil>",
          To: "Grace Hill <grace@bravo.mil>",
          Subject: "Status update",
          "Message-ID": "<m11@bravo.mil>",
        },
        "Bravo team status, unrelated conversation.",
      ),
      "e.eml",
    );
    const graph = analyze([d, e]);
    const threads = graph.nodes.filter((n) => n.type === "thread");
    expect(threads).toHaveLength(2);
  });

  it("falls back to normalized-subject grouping for header-less messages", () => {
    const f = one(
      eml(
        { From: "Alice Smith <alice@unit.mil>", To: "Bob Jones <bob@unit.mil>", Subject: "Weekly sync" },
        "Agenda below.",
      ),
      "f.eml",
    );
    const g = one(
      eml(
        { From: "Bob Jones <bob@unit.mil>", To: "Alice Smith <alice@unit.mil>", Subject: "RE: Weekly sync" },
        "Works for me.",
      ),
      "g.eml",
    );
    expect(f.messageId).toBeUndefined();
    const ids = assignThreads([f, g]);
    expect(ids.get(f.id)).toBe("thread:weekly sync");
    expect(ids.get(g.id)).toBe("thread:weekly sync");
    const graph = analyze([f, g]);
    expect(graph.nodes.filter((n) => n.type === "thread")).toHaveLength(1);
  });
});
