import type { GraphData, PersonMeta, ThreadMeta } from "./types";

const MAX_ITERATIONS = 20;

/**
 * Deterministic label propagation over person–person co-occurrence edges.
 * Fixed (sorted) iteration order with in-place updates and a lowest-label
 * tie-break, so the same input always yields the same communities.
 * Returns person node id → community id ("c1", "c2", … sized descending).
 */
export function detectCommunities(graph: GraphData): Map<string, string> {
  const personIds = graph.nodes
    .filter((n) => n.type === "person")
    .map((n) => n.id)
    .sort();

  const neighbors = new Map<string, Map<string, number>>();
  const addEdge = (a: string, b: string, w: number) => {
    let m = neighbors.get(a);
    if (!m) {
      m = new Map();
      neighbors.set(a, m);
    }
    m.set(b, (m.get(b) ?? 0) + w);
  };
  for (const l of graph.links) {
    if (l.type !== "cooccurs") continue;
    addEdge(l.source, l.target, l.weight);
    addEdge(l.target, l.source, l.weight);
  }

  const label = new Map<string, string>(personIds.map((id) => [id, id]));
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    for (const id of personIds) {
      const nbrs = neighbors.get(id);
      if (!nbrs || nbrs.size === 0) continue;
      const scores = new Map<string, number>();
      for (const [nbr, w] of nbrs) {
        const l = label.get(nbr);
        if (l === undefined) continue;
        scores.set(l, (scores.get(l) ?? 0) + w);
      }
      let best = "";
      let bestScore = -Infinity;
      for (const [l, s] of scores) {
        if (s > bestScore || (s === bestScore && l < best)) {
          best = l;
          bestScore = s;
        }
      }
      if (best && best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const members = new Map<string, string[]>();
  for (const id of personIds) {
    const l = label.get(id)!;
    const list = members.get(l);
    if (list) list.push(id);
    else members.set(l, [id]);
  }
  const ordered = [...members.values()].sort(
    (a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1),
  );
  const out = new Map<string, string>();
  ordered.forEach((group, i) => {
    for (const id of group) out.set(id, `c${i + 1}`);
  });
  return out;
}

/** Annotate person nodes with their community and threads with the majority community of their participants. */
export function applyCommunities(graph: GraphData): void {
  const byPerson = detectCommunities(graph);
  for (const n of graph.nodes) {
    if (n.type === "person") {
      (n.meta as PersonMeta).communityId = byPerson.get(n.id);
    } else if (n.type === "thread") {
      const meta = n.meta as ThreadMeta;
      const counts = new Map<string, number>();
      for (const key of meta.participantKeys) {
        const c = byPerson.get(`person:${key}`);
        if (!c) continue;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let best: string | undefined;
      let bestScore = -Infinity;
      for (const [c, s] of counts) {
        if (s > bestScore || (s === bestScore && best !== undefined && c < best)) {
          best = c;
          bestScore = s;
        }
      }
      meta.communityId = best;
    }
  }
}
