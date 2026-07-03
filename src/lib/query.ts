import type { Dataset, GraphNode, NodeType, PersonMeta, ThreadMeta } from "./types";

/**
 * Tiny query DSL over the graph.
 *
 * Syntax: whitespace-separated tokens; `field:value` tokens are filters
 * (value may be double-quoted to include spaces), everything else is a
 * free-text term matched against node labels. All filters and terms AND.
 *
 * Fields:
 *   type:person|thread|concept|sop
 *   from:<name>      people who sent matching messages + their threads
 *   to:<name>        people who received + threads addressed to them
 *   with:<name>      threads a matching person participated in + the person
 *   concept:<term>   concept nodes + threads mentioning them
 *   sop:<term>       SOP/data nodes + their threads
 *   community:<id>   people/threads in a detected community (c1, 1, …)
 *   source:<file>    nodes whose messages came from an uploaded file
 *   via:<linktype>   nodes touching a link of that type
 *   after:<date>     threads/senders with messages on/after date (before: too)
 *   min-degree:<n>   nodes with degree >= n
 *   min-count:<n>    nodes with count >= n
 */

export interface QueryFilter {
  field: string;
  value: string;
}

export interface ParsedQuery {
  terms: string[];
  filters: QueryFilter[];
}

const TOKEN_RE = /(\w[\w-]*):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;

export function parseQuery(input: string): ParsedQuery {
  const terms: string[] = [];
  const filters: QueryFilter[] = [];
  for (const m of input.matchAll(TOKEN_RE)) {
    if (m[1]) filters.push({ field: m[1].toLowerCase(), value: (m[2] ?? m[3] ?? "").toLowerCase() });
    else terms.push((m[4] ?? m[5] ?? "").toLowerCase());
  }
  return { terms: terms.filter(Boolean), filters };
}

const NODE_TYPES: NodeType[] = ["person", "thread", "concept", "sop"];

function labelMatch(n: GraphNode, q: string): boolean {
  return (
    n.label.toLowerCase().includes(q) ||
    (n.fullLabel ?? "").toLowerCase().includes(q) ||
    (n.meta.kind === "thread" && (n.meta as ThreadMeta).subject.toLowerCase().includes(q))
  );
}

/** Person nodes whose label or any address matches q. */
function matchingPersons(nodes: GraphNode[], q: string): GraphNode[] {
  return nodes.filter(
    (n) =>
      n.type === "person" &&
      (labelMatch(n, q) || (n.meta as PersonMeta).addresses.some((a) => a.toLowerCase().includes(q))),
  );
}

/**
 * Run a query against the dataset. Returns the set of matching node ids,
 * or null when the query is empty (meaning "no filter").
 */
export function runQuery(dataset: Dataset, input: string): Set<string> | null {
  const { terms, filters } = parseQuery(input);
  if (terms.length === 0 && filters.length === 0) return null;

  const nodes = dataset.graph.nodes;
  const msgById = new Map(dataset.messages.map((m) => [m.id, m]));
  let result: Set<string> | null = null;

  const intersect = (ids: Set<string>) => {
    if (result === null) result = ids;
    else result = new Set([...result].filter((id) => ids.has(id)));
  };

  for (const f of filters) {
    const ids = new Set<string>();
    switch (f.field) {
      case "type": {
        const t = NODE_TYPES.find((x) => x.startsWith(f.value));
        for (const n of nodes) if (n.type === t) ids.add(n.id);
        break;
      }
      case "from":
      case "to": {
        const persons = matchingPersons(nodes, f.value);
        const keys = new Set(persons.map((p) => p.id.replace(/^person:/, "")));
        for (const p of persons) {
          const meta = p.meta as PersonMeta;
          if (f.field === "from" ? meta.sentCount > 0 : meta.receivedCount > 0) ids.add(p.id);
        }
        for (const n of nodes) {
          if (n.type !== "thread") continue;
          const meta = n.meta as ThreadMeta;
          const hit = meta.messageIds.some((mid) => {
            const m = msgById.get(mid);
            if (!m) return false;
            return f.field === "from"
              ? m.from !== null && keys.has(m.from.key)
              : [...m.to, ...m.cc].some((p) => keys.has(p.key));
          });
          if (hit) ids.add(n.id);
        }
        break;
      }
      case "with": {
        const persons = matchingPersons(nodes, f.value);
        const keys = new Set(persons.map((p) => p.id.replace(/^person:/, "")));
        for (const p of persons) ids.add(p.id);
        for (const n of nodes) {
          if (n.type !== "thread") continue;
          if ((n.meta as ThreadMeta).participantKeys.some((k) => keys.has(k))) ids.add(n.id);
        }
        break;
      }
      case "text":
      case "body": {
        // Full-text over message subject+body; hits map to their thread and sender.
        const hitMsgIds = new Set<string>();
        const hitSenderKeys = new Set<string>();
        for (const m of dataset.messages) {
          if (m.subject.toLowerCase().includes(f.value) || m.body.toLowerCase().includes(f.value)) {
            hitMsgIds.add(m.id);
            if (m.from) hitSenderKeys.add(m.from.key);
          }
        }
        for (const n of nodes) {
          if (n.type === "thread" && (n.meta as ThreadMeta).messageIds.some((id) => hitMsgIds.has(id))) {
            ids.add(n.id);
          }
          if (n.type === "person" && hitSenderKeys.has(n.id.replace(/^person:/, ""))) ids.add(n.id);
        }
        break;
      }
      case "concept":
      case "sop": {
        for (const n of nodes) {
          if (n.type !== f.field) continue;
          if (!labelMatch(n, f.value)) continue;
          ids.add(n.id);
          const meta = n.meta as { threadIds?: string[] };
          for (const tid of meta.threadIds ?? []) ids.add(tid);
        }
        break;
      }
      case "community": {
        const want = f.value.startsWith("c") ? f.value : `c${f.value}`;
        for (const n of nodes) {
          const cid =
            n.meta.kind === "person" || n.meta.kind === "thread" ? n.meta.communityId : undefined;
          if (cid === want) ids.add(n.id);
        }
        break;
      }
      case "source": {
        const hitMsgIds = new Set<string>();
        for (const m of dataset.messages) {
          if (m.source.toLowerCase().includes(f.value)) hitMsgIds.add(m.id);
        }
        for (const n of nodes) {
          const meta = n.meta as { messageIds?: string[] };
          if ((meta.messageIds ?? []).some((mid) => hitMsgIds.has(mid))) ids.add(n.id);
        }
        break;
      }
      case "via": {
        const endId = (v: unknown): string =>
          typeof v === "object" && v !== null ? (v as { id: string }).id : (v as string);
        for (const l of dataset.graph.links) {
          if (!l.type.startsWith(f.value)) continue;
          ids.add(endId(l.source));
          ids.add(endId(l.target));
        }
        break;
      }
      case "after":
      case "before": {
        const bound = Date.parse(f.value);
        if (!Number.isFinite(bound)) break;
        const hitMsgIds = new Set<string>();
        const hitSenderKeys = new Set<string>();
        for (const m of dataset.messages) {
          if (!m.date) continue;
          const t = Date.parse(m.date);
          if (!Number.isFinite(t)) continue;
          if (f.field === "after" ? t >= bound : t <= bound) {
            hitMsgIds.add(m.id);
            if (m.from) hitSenderKeys.add(m.from.key);
          }
        }
        for (const n of nodes) {
          if (n.type === "thread" && (n.meta as ThreadMeta).messageIds.some((id) => hitMsgIds.has(id))) {
            ids.add(n.id);
          }
          if (n.type === "person" && hitSenderKeys.has(n.id.replace(/^person:/, ""))) ids.add(n.id);
        }
        break;
      }
      case "min-degree":
      case "mindegree": {
        const n = Number(f.value);
        if (Number.isFinite(n)) for (const node of nodes) if (node.degree >= n) ids.add(node.id);
        break;
      }
      case "min-count":
      case "mincount": {
        const n = Number(f.value);
        if (Number.isFinite(n)) for (const node of nodes) if (node.count >= n) ids.add(node.id);
        break;
      }
      default: {
        // Unknown field: treat "field:value" as a plain text term.
        for (const n of nodes) if (labelMatch(n, `${f.field}:${f.value}`) || labelMatch(n, f.value)) ids.add(n.id);
      }
    }
    intersect(ids);
  }

  for (const term of terms) {
    const ids = new Set<string>();
    for (const n of nodes) if (labelMatch(n, term)) ids.add(n.id);
    intersect(ids);
  }

  return result ?? new Set<string>();
}

export const QUERY_HELP = [
  ["type:person|thread|concept|sop", "only that node type"],
  ["from:hunt", "sender + their threads"],
  ["to:larareo", "recipient + threads to them"],
  ["with:thomas", "threads a person is in"],
  ["concept:phase", "concept + related threads"],
  ['text:"hyd flush"', "full-text in message bodies"],
  ["sop:dsr", "SOP/data refs + threads"],
  ["community:1", "people/threads in community 1"],
  ["source:inbox.csv", "nodes from an uploaded file"],
  ["via:mentions", "nodes on a link type"],
  ["after:2026-01-01", "dated messages on/after (before: too)"],
  ["min-degree:5", "well-connected nodes"],
  ['"exact phrase"', "quoted free text"],
] as const;
