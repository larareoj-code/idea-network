import type { Dataset } from "../lib/types";

interface Props {
  dataset: Dataset;
  visibleNodes: number;
  visibleLinks: number;
}

const MAX_INLINE_SOURCES = 4;

export default function StatsBar({ dataset, visibleNodes, visibleLinks }: Props) {
  const fullList = dataset.sources.map((s) => `${s.name} (${s.messageCount})`).join(" · ");
  const sourcesLabel =
    dataset.sources.length > MAX_INLINE_SOURCES
      ? `${dataset.sources.length} source files`
      : fullList;

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
      <span className="sources" title={fullList}>
        {sourcesLabel}
      </span>
    </div>
  );
}
