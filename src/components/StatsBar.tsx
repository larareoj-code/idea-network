import type { Dataset } from "../lib/types";

interface Props {
  dataset: Dataset;
  visibleNodes: number;
  visibleLinks: number;
}

export default function StatsBar({ dataset, visibleNodes, visibleLinks }: Props) {
  return (
    <div className="statsbar">
      <span>
        <b>{dataset.messages.length}</b> messages
      </span>
      <span>
        <b>{visibleNodes}</b> nodes
      </span>
      <span>
        <b>{visibleLinks}</b> edges
      </span>
      <span className="sources">
        {dataset.sources.map((s) => `${s.name} (${s.messageCount})`).join(" · ")}
      </span>
    </div>
  );
}
