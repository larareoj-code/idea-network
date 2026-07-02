import { analyze } from "./analyze";
import type { Dataset, Message, SourceInfo } from "./types";

export const SCHEMA_VERSION = 1 as const;
export const APP_VERSION = "v0.5";

export function buildDataset(messages: Message[], sources: SourceInfo[]): Dataset {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources,
    messages,
    graph: analyze(messages),
  };
}

/**
 * Merge new messages into an existing dataset. Messages are deduped by
 * content hash (subject+body+from); the graph is fully re-analyzed.
 */
export function mergeDataset(
  existing: Dataset | null,
  incoming: Message[],
  sourceName: string,
): Dataset {
  const messages = existing ? [...existing.messages] : [];
  const known = new Set(messages.map((m) => m.id));
  let added = 0;
  for (const msg of incoming) {
    if (known.has(msg.id)) continue;
    known.add(msg.id);
    messages.push(msg);
    added += 1;
  }
  const sources: SourceInfo[] = existing ? [...existing.sources] : [];
  const idx = sources.findIndex((s) => s.name === sourceName);
  if (idx >= 0) sources[idx] = { name: sourceName, messageCount: sources[idx].messageCount + added };
  else sources.push({ name: sourceName, messageCount: added });
  return buildDataset(messages, sources);
}

export function exportDatasetJson(dataset: Dataset): string {
  // Strip force-graph runtime mutations by serializing only canonical fields.
  const clean: Dataset = {
    schemaVersion: dataset.schemaVersion,
    generatedAt: dataset.generatedAt,
    sources: dataset.sources,
    messages: dataset.messages,
    graph: {
      nodes: dataset.graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        fullLabel: n.fullLabel,
        count: n.count,
        degree: n.degree,
        meta: n.meta,
      })),
      links: dataset.graph.links.map((l) => ({
        source: typeof l.source === "object" ? (l.source as { id: string }).id : l.source,
        target: typeof l.target === "object" ? (l.target as { id: string }).id : l.target,
        type: l.type,
        weight: l.weight,
      })),
    },
  };
  return JSON.stringify(clean, null, 2);
}

export function importDatasetJson(json: string): Dataset {
  const data = JSON.parse(json) as Partial<Dataset>;
  if (data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${String(data.schemaVersion)}`);
  }
  if (!Array.isArray(data.messages) || !data.graph || !Array.isArray(data.graph.nodes)) {
    throw new Error("Invalid dataset file: missing messages or graph");
  }
  // Rebuild the graph so imports from older exports stay consistent.
  return buildDataset(data.messages, data.sources ?? []);
}
