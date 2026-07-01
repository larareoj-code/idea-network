import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDisplayName, identityKey, parseOutlookCsv } from "../src/lib/parseOutlookCsv";
import { analyze, normalizeSubject } from "../src/lib/analyze";
import { mergeDataset } from "../src/lib/dataset";

const DATA_DIR = join(__dirname, "..", "data");

function loadCsv(name: string): string {
  return readFileSync(join(DATA_DIR, name), "utf-8");
}

describe("real Outlook export pipeline", () => {
  const inbox = parseOutlookCsv(loadCsv("Inbox Export.CSV"), "Inbox Export.CSV");
  const sent = parseOutlookCsv(loadCsv("SentExport.CSV"), "SentExport.CSV");

  it("parses messages from both sample files", () => {
    expect(inbox.length).toBeGreaterThan(0);
    expect(sent.length).toBeGreaterThan(0);
  });

  it("extracts sender identities from Exchange DNs", () => {
    const withFrom = inbox.filter((m) => m.from !== null);
    expect(withFrom.length).toBeGreaterThan(0);
    const exchange = withFrom.find((m) => m.from!.address.toLowerCase().includes("/cn="));
    expect(exchange).toBeDefined();
    expect(exchange!.from!.key).not.toContain("/");
    expect(exchange!.from!.key).toBe(exchange!.from!.key.toLowerCase());
  });

  it("parses multi-recipient To/CC fields defensively", () => {
    const multi = inbox.find((m) => m.to.length + m.cc.length > 1);
    expect(multi).toBeDefined();
    for (const m of inbox) {
      for (const p of [...m.to, ...m.cc]) {
        expect(p.key.length).toBeGreaterThan(0);
      }
    }
  });

  it("flags Teams boilerplate as low signal", () => {
    const all = [...inbox, ...sent];
    const teams = all.filter((m) => m.lowSignal);
    expect(teams.length).toBeGreaterThan(0);
  });

  it("builds a graph with persons, threads, concepts, and edges", () => {
    const graph = analyze([...inbox, ...sent]);
    const byType = (t: string) => graph.nodes.filter((n) => n.type === t);
    expect(byType("person").length).toBeGreaterThan(0);
    expect(byType("thread").length).toBeGreaterThan(0);
    expect(byType("concept").length).toBeGreaterThan(0);
    expect(byType("sop").length).toBeGreaterThan(0);
    expect(graph.links.length).toBeGreaterThan(0);

    // Every link endpoint must resolve to a real node.
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const l of graph.links) {
      expect(ids.has(l.source as string)).toBe(true);
      expect(ids.has(l.target as string)).toBe(true);
    }
  });

  it("dedupes messages when the same file is merged twice", () => {
    const d1 = mergeDataset(null, inbox, "Inbox Export.CSV");
    const d2 = mergeDataset(d1, inbox, "Inbox Export.CSV");
    expect(d2.messages.length).toBe(d1.messages.length);
  });
});

describe("unit helpers", () => {
  it("normalizes reply/forward subject prefixes repeatedly", () => {
    expect(normalizeSubject("RE: Re: FW: Fwd: Phase Update")).toBe("phase update");
  });

  it("derives identity keys from Exchange DNs and emails", () => {
    expect(
      identityKey(
        "/o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Recipients/cn=28541da5acec4962be00dd7ed0ee0fc7-josef.a.lar",
      ),
    ).toBe("josef.a.lar");
    expect(identityKey("Joe.Example@ARMY.MIL")).toBe("joe.example@army.mil");
  });

  it("cleans military display names", () => {
    expect(cleanDisplayName("Larareo, Josef A CW2 USARMY 25 ID CAVN BDE (USA)")).toBe("Josef Larareo");
    expect(cleanDisplayName("2-6 CAV DSR DISTRO")).toBe("2-6 CAV DSR DISTRO");
  });
});
