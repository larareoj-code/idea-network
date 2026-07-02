import type { Dataset, PersonMeta, ThreadMeta } from "./types";

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
  | "type-distribution"
  | "messages-over-time";

export const CHART_METRICS: { id: ChartMetric; label: string; kind: "bar" | "donut" }[] = [
  { id: "top-senders", label: "Top senders", kind: "bar" },
  { id: "top-recipients", label: "Top recipients", kind: "bar" },
  { id: "busiest-threads", label: "Busiest threads (messages)", kind: "bar" },
  { id: "biggest-threads", label: "Largest threads (participants)", kind: "bar" },
  { id: "top-concepts", label: "Top concepts", kind: "bar" },
  { id: "sop-mentions", label: "SOP / data references", kind: "bar" },
  { id: "type-distribution", label: "Node type distribution", kind: "donut" },
  { id: "messages-over-time", label: "Messages over time", kind: "bar" },
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
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      const data: ChartDatum[] = [...buckets.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .slice(-Math.max(topN, 12))
        .map(([label, value]) => ({ label, value }));
      return {
        kind: "bar",
        title:
          undated > 0
            ? `Messages over time (${undated} undated from CSV sources excluded)`
            : "Messages over time",
        data,
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
