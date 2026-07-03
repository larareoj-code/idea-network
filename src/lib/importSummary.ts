import type { Dataset, Message } from "./types";
import type { IngestItem } from "./ingest";

export interface FileSummary {
  name: string;
  messageCount: number;
  skippedCount: number;
  errorCount: number;
  dateRange: { earliest: string | null; latest: string | null };
  externalDomains: string[];
  warnings: string[];
}

export interface ImportSummary {
  files: FileSummary[];
  totalMessages: number;
  totalNodes: number;
  totalEdges: number;
  dedupeCount: number;
  parseErrors: string[];
}

function domainOf(address: string): string | null {
  if (!address) return null;
  // Exchange DN — no useful domain
  if (address.includes("/")) return null;
  const at = address.lastIndexOf("@");
  if (at === -1) return null;
  return address.slice(at + 1).toLowerCase();
}

function buildFileSummary(name: string, messages: Message[], skippedCount: number): FileSummary {
  const warnings: string[] = [];

  // Date range
  const exactDates = messages.map((m) => m.date).filter((d): d is string => !!d);
  const approxDates = messages.map((m) => m.approxDate).filter((d): d is string => !!d);
  let earliest: string | null = null;
  let latest: string | null = null;
  if (exactDates.length > 0) {
    const times = exactDates.map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t));
    if (times.length > 0) {
      earliest = new Date(Math.min(...times)).toISOString().slice(0, 10);
      latest = new Date(Math.max(...times)).toISOString().slice(0, 10);
    }
  } else if (approxDates.length > 0) {
    const sorted = [...approxDates].sort();
    earliest = sorted[0];
    latest = sorted[sorted.length - 1];
  }

  const undated = messages.filter((m) => !m.date && !m.approxDate).length;
  if (undated > 0) warnings.push(`${undated} message${undated === 1 ? "" : "s"} missing date`);

  // External domain detection
  const senderDomainCounts = new Map<string, number>();
  const recipientDomains = new Set<string>();

  for (const m of messages) {
    if (m.from?.address) {
      const d = domainOf(m.from.address);
      if (d) senderDomainCounts.set(d, (senderDomainCounts.get(d) ?? 0) + 1);
    }
    for (const p of [...m.to, ...m.cc]) {
      const d = domainOf(p.address);
      if (d) recipientDomains.add(d);
    }
  }

  // Dominant sender domain = internal
  let internalDomain: string | null = null;
  let maxCount = 0;
  for (const [d, count] of senderDomainCounts) {
    if (count > maxCount) {
      maxCount = count;
      internalDomain = d;
    }
  }

  const externalDomains: string[] = [];
  for (const d of recipientDomains) {
    if (d === internalDomain) continue;
    if (!senderDomainCounts.has(d)) externalDomains.push(d);
  }

  return {
    name,
    messageCount: messages.length,
    skippedCount,
    errorCount: 0,
    dateRange: { earliest, latest },
    externalDomains,
    warnings,
  };
}

/**
 * Build an ImportSummary describing what just parsed vs. what will actually
 * merge into the graph. Pass prevDataset (the dataset BEFORE this import) so
 * deduplication counts are accurate.
 */
export function buildImportSummary(
  results: IngestItem[],
  dataset: Dataset,
  prevDataset: Dataset | null,
  parseErrors: string[] = [],
): ImportSummary {
  // Collect hashes already known before this batch
  const prevKnown = new Set<string>((prevDataset?.messages ?? []).map((m) => m.id));

  // Count intra-batch and cross-batch duplicates
  const batchSeen = new Set<string>(prevKnown);
  let dedupeCount = 0;

  const files: FileSummary[] = [];

  for (const item of results) {
    let skipped = 0;
    const accepted: Message[] = [];
    for (const m of item.messages) {
      if (batchSeen.has(m.id)) {
        skipped++;
        dedupeCount++;
      } else {
        batchSeen.add(m.id);
        accepted.push(m);
      }
    }
    files.push(buildFileSummary(item.name, item.messages, skipped));
  }

  return {
    files,
    totalMessages: dataset.messages.length,
    totalNodes: dataset.graph.nodes.length,
    totalEdges: dataset.graph.links.length,
    dedupeCount,
    parseErrors,
  };
}
