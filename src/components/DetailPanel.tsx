import { Fragment, useMemo } from "react";
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
}

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"]+)/g;

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
          {msg.approxDate && <span className="approx"> · ~{msg.approxDate} (approx.)</span>}
        </div>
      </summary>
      <div className="msg-body">
        <Linkified text={msg.body.trim() || "(empty body)"} />
      </div>
    </details>
  );
}

export default function DetailPanel({ dataset, node, onNavigate, onClose }: Props) {
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
        </>
      );
    }

    if (node.meta.kind === "thread") {
      const meta = node.meta as ThreadMeta;
      const msgs = meta.messageIds.map((id) => messagesById.get(id)).filter((m): m is Message => !!m);
      return (
        <>
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
          <div className="detail-section">
            <div className="section-label">Messages</div>
            {msgs.map((m) => (
              <MessageCard key={m.id} msg={m} />
            ))}
          </div>
        </>
      );
    }

    // concept / sop: related threads
    const meta = node.meta as ConceptMeta | SopMeta;
    return (
      <>
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
