import type { Dataset, PersonMeta } from "./types";
import type { ChartSpec } from "./charts";

export function generateReport(dataset: Dataset, charts: ChartSpec[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const nodes = dataset.graph.nodes;
  const lines: string[] = [];

  lines.push(`# Idea Network Report — ${date}`);
  lines.push("");

  // Summary
  const nodeCount = nodes.length;
  const edgeCount = dataset.graph.links.length;
  const msgCount = dataset.messages.length;

  const senders = nodes
    .filter((n) => n.type === "person")
    .map((n) => ({ label: n.label, sent: (n.meta as PersonMeta).sentCount }))
    .filter((x) => x.sent > 0)
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5);

  const concepts = nodes
    .filter((n) => n.type === "concept")
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Nodes:** ${nodeCount}`);
  lines.push(`- **Edges:** ${edgeCount}`);
  lines.push(`- **Messages:** ${msgCount}`);
  lines.push("");

  if (senders.length > 0) {
    lines.push(`**Top senders:** ${senders.map((s) => `${s.label} (${s.sent})`).join(", ")}`);
    lines.push("");
  }

  if (concepts.length > 0) {
    lines.push(`**Top concepts:** ${concepts.map((c) => `${c.label} (${c.count})`).join(", ")}`);
    lines.push("");
  }

  // Charts
  for (const chart of charts) {
    lines.push(`## ${chart.title}`);
    lines.push("");
    if (chart.data.length === 0) {
      lines.push("_No data._");
    } else {
      lines.push("| Label | Value |");
      lines.push("|-------|-------|");
      for (const d of chart.data) {
        lines.push(`| ${d.label.replace(/\|/g, "\\|")} | ${d.value} |`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "_Privacy note: This report contains metadata derived from email. No message bodies are included._",
  );
  lines.push("");

  return lines.join("\n");
}
