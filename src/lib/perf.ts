/** Performance budgets and timing utilities. */

export interface PerfBudget {
  /** Max nodes before LOD sampling kicks in */
  lodThreshold: number;
  /** Max nodes before disabling physics */
  physicsThreshold: number;
  /** Max edges rendered before thinning */
  edgeBudget: number;
  /** Chunk size for progressive graph building */
  chunkSize: number;
  /** Delay between progressive chunks (ms) */
  chunkDelayMs: number;
}

export const DEFAULT_BUDGET: PerfBudget = {
  lodThreshold: 1500,
  physicsThreshold: 3000,
  edgeBudget: 8000,
  chunkSize: 500,
  chunkDelayMs: 16,
};

export interface PerfMark {
  label: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
}

let marks: PerfMark[] = [];

export function perfStart(label: string): () => void {
  const start = performance.now();
  const mark: PerfMark = { label, startMs: start };
  marks.push(mark);
  return () => {
    mark.endMs = performance.now();
    mark.durationMs = mark.endMs - mark.startMs;
  };
}

export function getPerfMarks(): PerfMark[] {
  return [...marks];
}

export function clearPerfMarks(): void {
  marks = [];
}

/** Sample nodes to stay within budget. Returns stable sample using node degree as weight. */
export function sampleNodes<T extends { id: string; degree?: number }>(
  nodes: T[],
  maxCount: number,
): T[] {
  if (nodes.length <= maxCount) return nodes;
  // Always keep highest-degree nodes
  const sorted = [...nodes].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
  return sorted.slice(0, maxCount);
}

/** Thin edges to stay within edgeBudget. Drops lowest-weight edges. */
export function thinEdges<L extends { weight?: number }>(links: L[], maxCount: number): L[] {
  if (links.length <= maxCount) return links;
  const sorted = [...links].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  return sorted.slice(0, maxCount);
}

/** Split an array into chunks for progressive processing. */
export function* chunkArray<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}

/** Schedule chunks with requestIdleCallback or setTimeout fallback. */
export function scheduleChunks<T>(
  chunks: T[][],
  onChunk: (chunk: T[], progress: number) => void,
  onDone: () => void,
  delayMs = 16,
): () => void {
  let cancelled = false;
  let i = 0;

  const step = () => {
    if (cancelled || i >= chunks.length) {
      if (!cancelled) onDone();
      return;
    }
    onChunk(chunks[i], (i + 1) / chunks.length);
    i++;
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(step, { timeout: delayMs * 4 });
    } else {
      setTimeout(step, delayMs);
    }
  };

  setTimeout(step, 0);
  return () => {
    cancelled = true;
  };
}
