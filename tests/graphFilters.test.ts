import { describe, expect, it } from "vitest";
import { connectedComponents, nonLargestComponentIds } from "../src/components/GraphFilters";
import type { GraphLink, GraphNode } from "../src/lib/types";

const node = (id: string): GraphNode => ({
  id,
  type: "concept",
  label: id,
  count: 1,
  degree: 0,
  meta: { kind: "concept", threadIds: [], occurrences: 1 },
});

const link = (source: string, target: string): GraphLink => ({
  source,
  target,
  type: "mentions",
  weight: 1,
});

describe("connectedComponents", () => {
  it("groups nodes by connectivity", () => {
    const nodes = ["a", "b", "c", "d", "e"].map(node);
    const links = [link("a", "b"), link("b", "c"), link("d", "e")];
    const comps = connectedComponents(nodes, links).map((c) => [...c].sort());
    expect(comps.length).toBe(2);
    expect(comps).toContainEqual(["a", "b", "c"]);
    expect(comps).toContainEqual(["d", "e"]);
  });

  it("treats an isolated node as its own component", () => {
    const comps = connectedComponents([node("x"), node("y")], []);
    expect(comps.length).toBe(2);
  });

  it("ignores links whose endpoints are not in the node set", () => {
    const comps = connectedComponents([node("a")], [link("a", "ghost")]);
    expect(comps).toEqual([["a"]]);
  });

  it("handles d3-mutated object link endpoints", () => {
    const nodes = ["a", "b"].map(node);
    const links = [{ ...link("a", "b"), source: { id: "a" }, target: { id: "b" } } as unknown as GraphLink];
    expect(connectedComponents(nodes, links).length).toBe(1);
  });
});

describe("nonLargestComponentIds", () => {
  it("returns everything outside the single largest component", () => {
    const nodes = ["a", "b", "c", "d", "e", "f"].map(node);
    const links = [link("a", "b"), link("b", "c"), link("d", "e")];
    const ids = nonLargestComponentIds(nodes, links);
    expect([...ids].sort()).toEqual(["d", "e", "f"]);
  });

  it("returns empty when the graph is one component", () => {
    const nodes = ["a", "b"].map(node);
    expect(nonLargestComponentIds(nodes, [link("a", "b")]).size).toBe(0);
  });

  it("returns empty for an empty graph", () => {
    expect(nonLargestComponentIds([], []).size).toBe(0);
  });
});
