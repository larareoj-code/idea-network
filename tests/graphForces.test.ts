import { describe, expect, it } from "vitest";
import {
  buildLayoutForce,
  datasetHasDates,
  groupAnchors,
  makeAnchorForce,
  makeCollideForce,
  makeDegreeForce,
  nodeDates,
  nodeGroups,
  timelinePositions,
  type SimNode,
} from "../src/lib/graphForces";
import type { GraphData, GraphNode, Message } from "../src/lib/types";

const person = (id: string, messageIds: string[] = [], degree = 1): GraphNode => ({
  id,
  type: "person",
  label: id,
  count: 1,
  degree,
  meta: { kind: "person", addresses: [], sentCount: 0, receivedCount: 0, messageIds },
});

const thread = (id: string, messageIds: string[] = [], degree = 1): GraphNode => ({
  id,
  type: "thread",
  label: id,
  count: 1,
  degree,
  meta: {
    kind: "thread",
    subject: id,
    messageIds,
    participantKeys: [],
    approxDates: [],
    lowSignal: false,
  },
});

const concept = (id: string, threadIds: string[]): GraphNode => ({
  id,
  type: "concept",
  label: id,
  count: 1,
  degree: 1,
  meta: { kind: "concept", threadIds, occurrences: 1 },
});

const msg = (id: string, source: string, date?: string): Message => ({
  id,
  subject: "s",
  body: "b",
  from: null,
  to: [],
  cc: [],
  importance: "",
  categories: "",
  source,
  lowSignal: false,
  date,
});

describe("groupAnchors", () => {
  it("places a single group at the origin", () => {
    const a = groupAnchors(["only"]);
    expect(a.get("only")).toEqual({ x: 0, y: 0 });
  });

  it("spreads groups on a circle of the given radius", () => {
    const a = groupAnchors(["a", "b", "c", "d"], 100);
    expect(a.size).toBe(4);
    for (const p of a.values()) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 6);
    }
    const pts = [...a.values()];
    const unique = new Set(pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(unique.size).toBe(4);
  });
});

describe("nodeGroups", () => {
  it("groups by node type", () => {
    const graph: GraphData = { nodes: [person("p1"), thread("t1")], links: [] };
    const g = nodeGroups("clusterType", graph, []);
    expect(g.get("p1")).toBe("person");
    expect(g.get("t1")).toBe("thread");
  });

  it("groups by dominant message source, concepts inherit from threads", () => {
    const messages = [msg("m1", "inbox.csv"), msg("m2", "inbox.csv"), msg("m3", "sent.csv")];
    const graph: GraphData = {
      nodes: [thread("t1", ["m1", "m2"]), person("p1", ["m3"]), concept("c1", ["t1"])],
      links: [],
    };
    const g = nodeGroups("clusterSource", graph, messages);
    expect(g.get("t1")).toBe("inbox.csv");
    expect(g.get("p1")).toBe("sent.csv");
    expect(g.get("c1")).toBe("inbox.csv");
  });

  it("groups by heaviest linked thread", () => {
    const graph: GraphData = {
      nodes: [thread("t1"), thread("t2"), person("p1")],
      links: [
        { source: "p1", target: "t1", type: "participated", weight: 1 },
        { source: "p1", target: "t2", type: "participated", weight: 5 },
      ],
    };
    const g = nodeGroups("clusterThread", graph, []);
    expect(g.get("p1")).toBe("t2");
    expect(g.get("t1")).toBe("t1");
    expect(g.get("t2")).toBe("t2");
  });
});

describe("nodeDates / timelinePositions", () => {
  it("derives node dates from messages and propagates to concepts", () => {
    const messages = [msg("m1", "a", "2024-01-01T00:00:00Z"), msg("m2", "a", "2024-06-01T00:00:00Z")];
    const graph: GraphData = {
      nodes: [thread("t1", ["m1", "m2"]), concept("c1", ["t1"]), person("p1", [])],
      links: [],
    };
    const d = nodeDates(graph, messages);
    expect(d.get("t1")).toBe(Date.parse("2024-01-01T00:00:00Z"));
    expect(d.get("c1")).toBe(d.get("t1"));
    expect(d.has("p1")).toBe(false);
  });

  it("maps dates onto a centered x span, oldest left", () => {
    const dates = new Map([
      ["a", 0],
      ["b", 50],
      ["c", 100],
    ]);
    const xs = timelinePositions(dates, 200);
    expect(xs.get("a")).toBe(-100);
    expect(xs.get("b")).toBe(0);
    expect(xs.get("c")).toBe(100);
  });

  it("handles a single date without dividing by zero", () => {
    const xs = timelinePositions(new Map([["a", 42]]), 200);
    expect(xs.get("a")).toBe(-100);
  });
});

describe("forces", () => {
  it("anchor force accelerates nodes toward their anchor", () => {
    const f = makeAnchorForce(() => ({ x: 100, y: 0 }), 0.5);
    const n: SimNode = { id: "n", x: 0, y: 0, vx: 0, vy: 0 };
    f.initialize?.([n]);
    f(1);
    expect(n.vx).toBeGreaterThan(0);
    expect(n.vy).toBe(0);
  });

  it("degree force pulls high-degree nodes inward more strongly", () => {
    const degrees = new Map([
      ["hub", 10],
      ["leaf", 1],
    ]);
    const f = makeDegreeForce(degrees, 0.5);
    const hub: SimNode = { id: "hub", x: 100, y: 0, vx: 0, vy: 0 };
    const leaf: SimNode = { id: "leaf", x: 100, y: 0, vx: 0, vy: 0 };
    f.initialize?.([hub, leaf]);
    f(1);
    expect(hub.vx!).toBeLessThan(leaf.vx!);
    expect(hub.vx!).toBeLessThan(0);
  });

  it("collide force pushes overlapping nodes apart", () => {
    const f = makeCollideForce(() => 10, 1);
    const a: SimNode = { id: "a", x: 0, y: 0, vx: 0, vy: 0 };
    const b: SimNode = { id: "b", x: 5, y: 0, vx: 0, vy: 0 };
    f.initialize?.([a, b]);
    f(1);
    expect(a.vx!).toBeLessThan(0);
    expect(b.vx!).toBeGreaterThan(0);
  });

  it("collide force leaves separated nodes alone", () => {
    const f = makeCollideForce(() => 2, 1);
    const a: SimNode = { id: "a", x: 0, y: 0, vx: 0, vy: 0 };
    const b: SimNode = { id: "b", x: 50, y: 0, vx: 0, vy: 0 };
    f.initialize?.([a, b]);
    f(1);
    expect(a.vx).toBe(0);
    expect(b.vx).toBe(0);
  });
});

describe("buildLayoutForce", () => {
  const graph: GraphData = { nodes: [person("p1", [], 3), thread("t1", [], 1)], links: [] };

  it("returns null for plain force-directed", () => {
    expect(buildLayoutForce("force", graph, [])).toBeNull();
  });

  it("returns a working force for each non-default mode", () => {
    for (const mode of ["clusterType", "clusterSource", "clusterThread", "degree"] as const) {
      const f = buildLayoutForce(mode, graph, []);
      expect(f).toBeTypeOf("function");
      const n: SimNode = { id: "p1", x: 10, y: 10, vx: 0, vy: 0 };
      f!.initialize?.([n]);
      expect(() => f!(1)).not.toThrow();
    }
  });
});

describe("datasetHasDates", () => {
  it("detects presence of real dates", () => {
    expect(datasetHasDates([msg("m1", "a")])).toBe(false);
    expect(datasetHasDates([msg("m1", "a"), msg("m2", "a", "2024-01-01")])).toBe(true);
  });
});
