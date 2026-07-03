interface Props {
  query: string;
  matchCount: number;
  position: number | null;
  onPrev: () => void;
  onNext: () => void;
}

export default function GraphSearch({ query, matchCount, position, onPrev, onNext }: Props) {
  if (!query.trim()) return null;
  return (
    <div className="graph-search">
      <span className="graph-search-count">
        {matchCount === 0
          ? "No matches"
          : position !== null
            ? `${position + 1} of ${matchCount}`
            : `${matchCount} match${matchCount === 1 ? "" : "es"}`}
      </span>
      <button className="graph-search-btn" onClick={onPrev} disabled={matchCount === 0} title="Previous match">
        ‹
      </button>
      <button className="graph-search-btn" onClick={onNext} disabled={matchCount === 0} title="Next match">
        ›
      </button>
    </div>
  );
}
