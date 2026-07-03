import { Fragment, useMemo, useRef } from "react";
import type {
  ConceptMeta,
  Dataset,
  GraphNode,
  Message,
  PersonMeta,
  SopMeta,
  ThreadMeta,
} from "../lib/types";
import { NODE_COLORS } from "./GraphView";

interface Props {
  dataset: Dataset | null;
  node: GraphNode | null;
  onNavigate: (nodeId: string) => void;
  onClose: () => void;
  onIsolate: (nodeId: string) => void;
  // Pin/hide/expand state lives in App (Phase A's ownership) — the panel only
  // calls these props. Optional with no-op defaults so it works standalone
  // until that branch merges.
  onExpandNeighbors?: (nodeId: string) => void;
  pinnedIds?: Set<string>;
  onPin?: (nodeId: string) => void;
  hiddenIds?: Set<string>;
  onHide?: (nodeId: string) => void;
}

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"]+)/g;
const NOOP = () => {};
const EMPTY_SET = new Set<string>();

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_SPLIT_RE);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function MessageCard({ msg }: { msg: Message }) {
  return (
    <details className="msg-card">
      <summary>
        <div className="msg-from">
          {msg.from?.displayName ?? "(unknown sender)"}
          {msg.lowSignal && <span className="tag">low signal</span>}
        </div>
        <div className="msg-meta">
          {msg.subject || "(no subject)"}
          {msg.date ? (
            <span className="approx"> · {new Date(msg.date).toLocaleString()}</span>
          ) : (
            msg.approxDate && <span className="approx"> · ~{msg.approxDate} (approx.)</span>
          )}
        </div>
      </summary>
      <div className="msg-body">
        <Linkified text={msg.body.trim() || "(empty body)"} />
      </div>
    </details>
  );
}

function seenRange(msgs: Message[]): { first: string; last: string } | null {
  const exact = msgs
    .map((m) => (m.date ? new Date(m.date).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (exact.length > 0) {
    return {
      first: new Date(Math.min(...exact)).toLocaleDateString(),
      last: new Date(Math.max(...exact)).toLocaleDateString(),
    };
  }
  const approx = [...new Set(msgs.map((m) => m.approxDate).filter((d): d is string => !!d))].sort();
  if (approx.length > 0) {
    return { first: `~${approx[0]} (approx.)`, last: `~${approx[approx.length - 1]} (approx.)` };
  }
  return null;
}

export default function DetailPanel({
  dataset,
  node,
  onNavigate,
  onClose,
  onIsolate,
  onExpandNeighbors = NOOP,
  pinnedIds = EMPTY_SET,
  onPin = NOOP,
  hiddenIds = EMPTY_SET,
  onHide = NOOP,
}: Props) {
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of dataset?.messages ?? []) map.set(m.id, m);
    return map;
  }, [dataset]);

  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of dataset?.graph.nodes ?? []) map.set(n.id, n);
    return map;
  }, [dataset]);

  const sourceTargetRef = useRef<HTMLDivElement>(null);

  const nodeMessages = useMemo<Message[]>(() => {
    if (!node || !dataset) return [];
    const ids =
      node.meta.kind === "person" || node.meta.kind === "thread"
        ? node.meta.messageIds
        : (node.meta as ConceptMeta | SopMeta).threadIds.flatMap(
            (tid) => (nodesById.get(tid)?.meta as ThreadMeta | undefined)?.messageIds ?? [],
          );
    return [...new Set(ids)].map((id) => messagesById.get(id)).filter((m): m is Message => !!m);
  }, [node, dataset, nodesById, messagesById]);

  const sourceFiles = useMemo(
    () => [...new Set(nodeMessages.map((m) => m.source))].sort(),
    [nodeMessages],
  );

  const seen = useMemo(() => seenRange(nodeMessages), [nodeMessages]);

  const revealSource = () => {
    const el = sourceTargetRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = el.querySelector("details");
    if (first) first.open = true;
  };

  const overview = (n: GraphNode) => (
    <div className="detail-section">
      <div className="kv"><span>Connections</span><b>{n.degree}</b></div>
      {seen ? (
        <>
          <div className="kv"><span>First seen</span><span className="approx">{seen.first}</span></div>
          <div className="kv"><span>Last seen</span><span className="approx">{seen.last}</span></div>
        </>
      ) : (
        <div className="kv">
          <span>First / last seen</span>
          <span className="approx">unknown — no dates in this source</span>
        </div>
      )}
    </div>
  );

  const actions = (n: GraphNode) => {
    const pinned = pinnedIds.has(n.id);
    const hidden = hiddenIds.has(n.id);
    return (
      <div className="detail-actions">
        <button className="btn small" onClick={() => onIsolate(n.id)} title="Show only this node and its direct neighbors">
          Isolate
        </button>
        <button
          className="btn small"
          onClick={() => onExpandNeighbors(n.id)}
          title="Temporarily reveal this node's neighbors even if hidden by filters"
        >
          Expand neighbors
        </button>
        <button
          className={`btn small ${pinned ? "active" : ""}`}
          onClick={() => onPin(n.id)}
          title={pinned ? "Unpin this node's position" : "Pin this node's position"}
        >
          {pinned ? "Pinned ●" : "Pin"}
        </button>
        <button className="btn small" onClick={() => onHide(n.id)} title={hidden ? "Unhide this node" : "Hide this node from the graph"}>
          {hidden ? "Unhide" : "Hide"}
        </button>
        <button
          className="btn small"
          onClick={revealSource}
          disabled={sourceFiles.length === 0}
          title="Jump to the originating messages / source files in this panel"
        >
          Jump to source
        </button>
      </div>
    );
  };

  // Per-source message counts and date ranges for the lineage section
  const sourceLineage = useMemo(() => {
    return sourceFiles.map((name) => {
      const msgs = nodeMessages.filter((m) => m.source === name);
      const range = seenRange(msgs);
      return { name, count: msgs.length, range };
    });
  }, [sourceFiles, nodeMessages]);

  const sourcesSection =
    sourceFiles.length > 0 ? (
      <div className="detail-section">
        <div className="section-label">Source files</div>
        <div className="kv-grid">
          {sourceLineage.map(({ name, count, range }) => (
            <div key={name} className="source-lineage-row">
              <span className="source-lineage-name" title={name}>{name}</span>
              <span className="meta">{count} msg{count === 1 ? "" : "s"}</span>
              {range ? (
                <span className="approx source-lineage-range">{range.first}{range.first !== range.last ? ` → ${range.last}` : ""}</span>
              ) : (
                <span className="approx source-lineage-range">no dates</span>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const relatedPeople = (threadIds: string[]) => {
    const keys = new Set<string>();
    for (const tid of threadIds) {
      const tm = nodesById.get(tid)?.meta as ThreadMeta | undefined;
      for (const k of tm?.participantKeys ?? []) keys.add(k);
    }
    const people = [...keys]
      .map((k) => nodesById.get(`person:${k}`))
      .filter((p): p is GraphNode => !!p);
    if (people.length === 0) return null;
    return (
      <div className="detail-section">
        <div className="section-label">Related people</div>
        <ul className="item-list">
          {people.map((p) => (
            <li key={p.id} className="clickable" onClick={() => onNavigate(p.id)}>
              {p.label}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const content = () => {
    if (!node || !dataset) return null;

    if (node.meta.kind === "person") {
      const meta = node.meta as PersonMeta;
      const msgs = meta.messageIds.map((id) => messagesById.get(id)).filter((m): m is Message => !!m);
      const contactCounts = new Map<string, number>();
      const threadIds = new Set<string>();
      for (const m of msgs) {
        const all = [m.from, ...m.to, ...m.cc].filter((p): p is NonNullable<typeof p> => !!p);
        for (const p of all) {
          if (`person:${p.key}` === node.id) continue;
          contactCounts.set(`person:${p.key}`, (contactCounts.get(`person:${p.key}`) ?? 0) + 1);
        }
      }
      for (const l of dataset.graph.links) {
        const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
        const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
        if (l.type === "participated" && s === node.id) threadIds.add(t);
      }
      const topContacts = [...contactCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      return (
        <>
          {overview(node)}
          {actions(node)}
          <div className="detail-section">
            <div className="kv"><span>Messages</span><b>{node.count}</b></div>
            <div className="kv"><span>Sent</span><b>{meta.sentCount}</b></div>
            <div className="kv"><span>Received / copied</span><b>{meta.receivedCount}</b></div>
          </div>
          {meta.addresses.length > 0 && (
            <div className="detail-section">
              <div className="section-label">Addresses</div>
              <ul className="item-list">
                {meta.addresses.map((a) => (
                  <li key={a} style={{ overflowWrap: "anywhere" }}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {topContacts.length > 0 && (
            <div className="detail-section">
              <div className="section-label">Top contacts</div>
              <ul className="item-list">
                {topContacts.map(([id, count]) => (
                  <li key={id} className="clickable" onClick={() => onNavigate(id)}>
                    {nodesById.get(id)?.label ?? id} <span className="meta">· {count} msgs</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="detail-section">
            <div className="section-label">Threads</div>
            <ul className="item-list">
              {[...threadIds].map((id) => (
                <li key={id} className="clickable" onClick={() => onNavigate(id)}>
                  {(nodesById.get(id)?.meta as ThreadMeta | undefined)?.subject ?? id}
                </li>
              ))}
            </ul>
          </div>
          <div ref={sourceTargetRef}>
            {sourcesSection}
            <div className="detail-section">
              <div className="section-label">Messages</div>
              {msgs.map((m) => (
                <MessageCard key={m.id} msg={m} />
              ))}
            </div>
          </div>
        </>
      );
    }

    if (node.meta.kind === "thread") {
      const meta = node.meta as ThreadMeta;
      const msgs = meta.messageIds.map((id) => messagesById.get(id)).filter((m): m is Message => !!m);
      return (
        <>
          {overview(node)}
          {actions(node)}
          <div className="detail-section">
            <div className="kv"><span>Messages</span><b>{msgs.length}</b></div>
            <div className="kv"><span>Participants</span><b>{meta.participantKeys.length}</b></div>
            {meta.approxDates.length > 0 && (
              <div className="kv">
                <span>Approx. dates seen</span>
                <span className="approx">{meta.approxDates.slice(0, 2).join(" · ")}</span>
              </div>
            )}
          </div>
          <div className="detail-section">
            <div className="section-label">Participants</div>
            <ul className="item-list">
              {meta.participantKeys.map((k) => {
                const id = `person:${k}`;
                return (
                  <li key={k} className="clickable" onClick={() => onNavigate(id)}>
                    {nodesById.get(id)?.label ?? k}
                  </li>
                );
              })}
            </ul>
          </div>
          <div ref={sourceTargetRef}>
            {sourcesSection}
            <div className="detail-section">
              <div className="section-label">Messages</div>
              {msgs.map((m) => (
                <MessageCard key={m.id} msg={m} />
              ))}
            </div>
          </div>
        </>
      );
    }

    const meta = node.meta as ConceptMeta | SopMeta;
    return (
      <>
        {overview(node)}
        {actions(node)}
        <div className="detail-section">
          {node.meta.kind === "concept" ? (
            <>
              <div className="kv"><span>Occurrences</span><b>{(meta as ConceptMeta).occurrences}</b></div>
              <div className="kv"><span>Threads</span><b>{meta.threadIds.length}</b></div>
            </>
          ) : (
            <>
              <div className="kv"><span>Category</span><b>{(meta as SopMeta).category}</b></div>
              <div className="kv"><span>Mentions</span><b>{node.count}</b></div>
            </>
          )}
        </div>
        <div className="detail-section">
          <div className="section-label">Related threads</div>
          <ul className="item-list">
            {meta.threadIds.map((id) => (
              <li key={id} className="clickable" onClick={() => onNavigate(id)}>
                {(nodesById.get(id)?.meta as ThreadMeta | undefined)?.subject ?? id.replace(/^thread:/, "")}
              </li>
            ))}
          </ul>
        </div>
        {relatedPeople(meta.threadIds)}
        <div ref={sourceTargetRef}>{sourcesSection}</div>
      </>
    );
  };

  return (
    <div className={`detail ${node ? "open" : ""}`}>
      {node && (
        <>
          <div className="detail-header">
            <span className="type-dot" style={{ background: NODE_COLORS[node.type] }} />
            <div>
              <h2>{node.meta.kind === "thread" ? (node.meta as ThreadMeta).subject : node.label}</h2>
              {node.fullLabel && node.fullLabel !== node.label && node.meta.kind !== "thread" && (
                <div className="sub">{node.fullLabel}</div>
              )}
            </div>
            <button className="detail-close" onClick={onClose} aria-label="Close panel">
              ✕
            </button>
          </div>
          <div className="detail-body">{content()}</div>
        </>
      )}
    </div>
  );
}
