import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUDGET,
  sampleNodes,
  thinEdges,
  chunkArray,
  perfStart,
  getPerfMarks,
  clearPerfMarks,
} from "../src/lib/perf";

describe("DEFAULT_BUDGET", () => {
  it("has expected shape", () => {
    expect(DEFAULT_BUDGET.lodThreshold).toBeGreaterThan(0);
    expect(DEFAULT_BUDGET.edgeBudget).toBeGreaterThan(0);
    expect(DEFAULT_BUDGET.chunkSize).toBeGreaterThan(0);
  });
});

describe("sampleNodes", () => {
  const makeNodes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `n${i}`, degree: i }));

  it("returns all nodes when under budget", () => {
    const nodes = makeNodes(100);
    expect(sampleNodes(nodes, 200)).toHaveLength(100);
  });

  it("trims to maxCount", () => {
    const nodes = makeNodes(2000);
    const sampled = sampleNodes(nodes, 500);
    expect(sampled).toHaveLength(500);
  });

  it("keeps highest-degree nodes", () => {
    const nodes = makeNodes(100);
    const sampled = sampleNodes(nodes, 10);
    const minDegree = Math.min(...sampled.map((n) => n.degree));
    expect(minDegree).toBeGreaterThanOrEqual(90);
  });
});

describe("thinEdges", () => {
  const makeLinks = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ weight: i }));

  it("passes through when under budget", () => {
    const links = makeLinks(100);
    expect(thinEdges(links, 200)).toHaveLength(100);
  });

  it("trims to maxCount", () => {
    const links = makeLinks(10000);
    expect(thinEdges(links, 8000)).toHaveLength(8000);
  });

  it("keeps highest-weight edges", () => {
    const links = makeLinks(100);
    const thinned = thinEdges(links, 10);
    const minW = Math.min(...thinned.map((l) => l.weight));
    expect(minW).toBeGreaterThanOrEqual(90);
  });
});

describe("chunkArray", () => {
  it("splits correctly", () => {
    const arr = Array.from({ length: 10 }, (_, i) => i);
    const chunks = [...chunkArray(arr, 3)];
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual([0, 1, 2]);
    expect(chunks[3]).toEqual([9]);
  });

  it("handles empty array", () => {
    expect([...chunkArray([], 10)]).toHaveLength(0);
  });
});

describe("perfStart / getPerfMarks", () => {
  it("records timing on end()", () => {
    clearPerfMarks();
    const end = perfStart("test-op");
    end();
    const marks = getPerfMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0].label).toBe("test-op");
    expect(marks[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("clears on clearPerfMarks()", () => {
    clearPerfMarks();
    expect(getPerfMarks()).toHaveLength(0);
  });
});
