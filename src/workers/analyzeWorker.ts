import { applyCommunities } from "../lib/communities";
import type { GraphData } from "../lib/types";

export type AnalyzeRequest = {
  type: "communities";
  graph: GraphData;
};

export type AnalyzeResponse =
  | { type: "communities:done"; graph: GraphData }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  try {
    if (e.data.type === "communities") {
      const graph: GraphData = e.data.graph;
      applyCommunities(graph);
      self.postMessage({ type: "communities:done", graph } satisfies AnalyzeResponse);
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies AnalyzeResponse);
  }
};
