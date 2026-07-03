import type { Dataset, PersonMeta, ThreadMeta, ConceptMeta } from "./types";

export interface ChartDatum {
  label: string;
  value: number;
  /** Node to select when the datum is clicked. */
  nodeId?: string;
  color?: string;
}

export interface ChartSpec {
  kind: "bar" | "donut";
  title: string;
  data: ChartDatum[];
}

export type ChartMetric =
  | "top-senders"
  | "top-recipients"
  | "busiest-threads"
  | "biggest-threads"
  | "top-concepts"
  | "sop-mentions"
  | "communities"
  | "type-distribution"
  | "messages-over-time"
  | "unresolved-threads"
  | "sop-by-degree"
  | "concept-drift";

export const CHART_METRICS: { id: ChartMetric; label: string; kind: "bar" | "donut" }[] = [
  { id: "top-senders", label: "Top senders", kind: "bar" },
  { id: "top-recipients", label: "Top recipients", kind: "bar" },
  { id: "busiest-threads", label: "Busiest threads (messages)", kind: "bar" },
  { id: "biggest-threads", label: "Largest threads (participants)", kind: "bar" },
  { id: "top-concepts", label: "Top concepts", kind: "bar" },
  { id: "sop-mentions", label: "SOP / data references", kind: "bar" },
  { id: "communities", label: "Community sizes", kind: "bar" },
  { id: "type-distribution", label: "Node type distribution", kind: "donut" },
  { id: "messages-over-time", label: "Messages over time", kind: "bar" },
  { id: "unresolved-threads", label: "Unresolved threads", kind: "bar" },
  { id: "sop-by-degree", label: "SOP mentions (by degree)", kind: "bar" },
  { id: "concept-drift", label: "Concept drift (new concepts/month)", kind: "bar" },
];

const TYPE_COLORS: Record<string, string> = {
  person: "#60a5fa",
  thread: "#fbbf24",
  concept: "#34d399",
  sop: "#f472b6",
};

export function buildChart(dataset: Dataset, metric: ChartMetric, topN = 10): ChartSpec {
  const nodes = dataset.graph.nodes;
  const top = (data: ChartDatum[]) =>
    data
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, topN);

  switch (metric) {
    case "top-senders":
      return {
        kind: "bar",
        title: `Top ${topN} senders`,
        data: top(
          nodes
            .filter((n) => n.type === "person")
            .map((n) => ({ label: n.label, value: (n.meta as PersonMeta).sentCount, nodeId: n.id })),
        ),
      };
    case "top-recipients":
      return {
        kind: "bar",
        title: `Top ${topN} recipients`,
        data: top(
          nodes
            .filter((n) => n.type === "person")
            .map((n) => ({ label: n.label, value: (n.meta as PersonMeta).receivedCount, nodeId: n.id })),
        ),
      };
    case "busiest-threads":
      return {
        kind: "bar",
        title: `Busiest ${topN} threads by messages`,
        data: top(
          nodes
            .filter((n) => n.type === "thread")
            .map((n) => ({
              label: (n.meta as ThreadMeta).subject,
              value: (n.meta as ThreadMeta).messageIds.length,
              nodeId: n.id,
            })),
        ),
      };
    case "biggest-threads":
      return {
        kind: "bar",
        title: `Largest ${topN} threads by participants`,
        data: top(
          nodes
            .filter((n) => n.type === "thread")
            .map((n) => ({
              label: (n.meta as ThreadMeta).subject,
              value: (n.meta as ThreadMeta).participantKeys.length,
              nodeId: n.id,
            })),
        ),
      };
    case "top-concepts":
      return {
        kind: "bar",
        title: `Top ${topN} concepts`,
        data: top(
          nodes
            .filter((n) => n.type === "concept")
            .map((n) => ({ label: n.label, value: n.count, nodeId: n.id })),
        ),
      };
    case "sop-mentions":
      return {
        kind: "bar",
        title: "SOP / data references",
        data: top(
          nodes
            .filter((n) => n.type === "sop")
            .map((n) => ({ label: n.label, value: n.count, nodeId: n.id })),
        ),
      };
    case "communities": {
      const counts = new Map<string, number>();
      for (const n of nodes) {
        if (n.type !== "person") continue;
        const c = (n.meta as PersonMeta).communityId;
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      return {
        kind: "bar",
        title: `Largest ${topN} communities by members`,
        data: top([...counts.entries()].map(([label, value]) => ({ label, value }))),
      };
    }
    case "messages-over-time": {
      // Chronological month buckets from exact dates (PST/MSG/EML sources).
      // CSV exports carry no dates, so undated messages are counted separately.
      const buckets = new Map<string, number>();
      let undated = 0;
      for (const m of dataset.messages) {
        if (!m.date) {
          undated += 1;
          continue;
        }
        const d = new Date(m.date);
        if (Number.isNaN(d.getTime())) {
          undated += 1;
          continue;
        }
        // UTC so a message lands in the same month for every viewer.
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      const sorted = [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const shown = sorted.slice(-Math.max(topN, 12));
      const hidden = sorted.length - shown.length;
      const notes: string[] = [];
      if (undated > 0) notes.push(`${undated} undated from CSV sources excluded`);
      if (hidden > 0) notes.push(`${hidden} older months hidden`);
      return {
        kind: "bar",
        title: notes.length > 0 ? `Messages over time (${notes.join("; ")})` : "Messages over time",
        data: shown.map(([label, value]) => ({ label, value })),
      };
    }
    case "unresolved-threads": {
      // A thread is "unresolved" if its last message has no known reply:
      // no other thread message has inReplyTo matching any messageId in the thread.
      const msgById = new Map(dataset.messages.map((m) => [m.id, m]));
      const replyTargets = new Set(
        dataset.messages.flatMap((m) => (m.inReplyTo ? [m.inReplyTo] : [])),
      );
      const threadNodes = nodes.filter((n) => n.type === "thread");
      const unresolved: ChartDatum[] = [];
      for (const n of threadNodes) {
        const meta = n.meta as ThreadMeta;
        // Gather Message-IDs for all messages in this thread
        const msgIds = meta.messageIds.map((id) => msgById.get(id)).filter(Boolean);
        // Check if any message in the thread has been replied to
        const hasReply = msgIds.some((m) => m!.messageId && replyTargets.has(m!.messageId));
        if (!hasReply) {
          unresolved.push({ label: meta.subject, value: 1, nodeId: n.id });
        }
      }
      return {
        kind: "bar",
        title: "Unresolved threads",
        data: unresolved.slice(0, topN),
      };
    }
    case "sop-by-degree": {
      return {
        kind: "bar",
        title: "SOP mentions (by degree)",
        data: top(
          nodes
            .filter((n) => n.type === "sop")
            .map((n) => ({ label: n.label, value: n.degree, nodeId: n.id })),
        ),
      };
    }
    case "concept-drift": {
      // Group concept nodes by month of first appearance (derived from message dates).
      const msgById2 = new Map(dataset.messages.map((m) => [m.id, m]));
      const buckets = new Map<string, number>();
      let hasDates = false;
      for (const n of nodes) {
        if (n.type !== "concept") continue;
        const meta = n.meta as ConceptMeta;
        // Find earliest dated message mentioning this concept
        let earliest: string | null = null;
        for (const tid of meta.threadIds) {
          // tid is a thread node id; look up thread meta
          const tnode = nodes.find((x) => x.id === tid);
          if (!tnode || tnode.type !== "thread") continue;
          for (const mid of (tnode.meta as ThreadMeta).messageIds) {
            const m = msgById2.get(mid);
            if (!m?.date) continue;
            hasDates = true;
            if (earliest === null || m.date < earliest) earliest = m.date;
          }
        }
        if (earliest) {
          const d = new Date(earliest);
          if (!Number.isNaN(d.getTime())) {
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
          }
        }
      }
      if (!hasDates) {
        return {
          kind: "bar",
          title: "Concept drift (new concepts/month) — no dated messages",
          data: [],
        };
      }
      const sorted = [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return {
        kind: "bar",
        title: "Concept drift (new concepts/month)",
        data: sorted.map(([label, value]) => ({ label, value })),
      };
    }
    case "type-distribution": {
      const counts: Record<string, number> = { person: 0, thread: 0, concept: 0, sop: 0 };
      for (const n of nodes) counts[n.type] += 1;
      return {
        kind: "donut",
        title: "Node type distribution",
        data: Object.entries(counts).map(([label, value]) => ({
          label,
          value,
          color: TYPE_COLORS[label],
        })),
      };
    }
  }
}

export function isChartMetric(v: unknown): v is ChartMetric {
  return typeof v === "string" && CHART_METRICS.some((m) => m.id === v);
}
