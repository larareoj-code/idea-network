import type { Message } from "./types";

/** Strip Re:/Fw:/Fwd: prefixes repeatedly, trim, casefold. */
export function normalizeSubject(subject: string): string {
  let s = (subject || "").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim();
  }
  return s.toLowerCase();
}

export function subjectThreadId(subject: string): string {
  return `thread:${normalizeSubject(subject) || "(no subject)"}`;
}

function rfcIdsOf(msg: Message): string[] {
  const ids: string[] = [];
  const push = (id: string | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(msg.messageId);
  push(msg.inReplyTo);
  for (const r of msg.references ?? []) push(r);
  return ids;
}

/**
 * Assign each message a thread id. Messages carrying RFC reply headers are
 * grouped by connected component of the msg-id graph (own Message-ID plus any
 * In-Reply-To/References ids — two replies to a missing common ancestor still
 * join), regardless of subject text. Header-less messages (CSV exports) keep
 * the legacy normalized-subject grouping, byte-identical to before.
 */
export function assignThreads(messages: Message[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const anchorByMessage = new Map<string, string>();
  for (const msg of messages) {
    const ids = rfcIdsOf(msg);
    if (ids.length === 0) continue;
    const anchor = msg.messageId ?? `local:${msg.id}`;
    anchorByMessage.set(msg.id, anchor);
    union(anchor, anchor);
    for (const id of ids) union(anchor, id);
  }

  const minIdByRoot = new Map<string, string>();
  for (const id of parent.keys()) {
    const root = find(id);
    const cur = minIdByRoot.get(root);
    if (cur === undefined || id < cur) minIdByRoot.set(root, id);
  }

  const out = new Map<string, string>();
  for (const msg of messages) {
    const anchor = anchorByMessage.get(msg.id);
    if (anchor) {
      out.set(msg.id, `thread:rfc:${minIdByRoot.get(find(anchor))!}`);
    } else {
      out.set(msg.id, subjectThreadId(msg.subject));
    }
  }
  return out;
}
