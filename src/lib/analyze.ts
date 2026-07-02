import type {
  GraphData,
  GraphLink,
  GraphNode,
  LinkType,
  Message,
  Participant,
  PersonMeta,
  SopMeta,
  ThreadMeta,
} from "./types";

export interface AnalyzeOptions {
  /** How many concept nodes to keep. */
  maxConcepts?: number;
}

const DEFAULTS: Required<AnalyzeOptions> = { maxConcepts: 30 };

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

const STOPWORDS = new Set(
  (
    "a able about above after again against all also am an and any are aren't as at be because been before being below " +
    "between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for " +
    "from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i'd i'll i'm " +
    "i've if in into is isn't it it's its itself just let's me more most mustn't my myself no nor not of off on once " +
    "only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that that's " +
    "the their theirs them themselves then there there's these they they'd they'll they're they've this those through to " +
    "too under until up very was wasn't we we'd we'll we're we've were weren't what what's when where where's which while " +
    "who who's whom why with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves will " +
    // Email / domain boilerplate that carries no topical signal
    "sent subject mailto http https www com mil org net gov re fw fwd cc bcc attached attachment attachments please thank " +
    "thanks sir ma'am maam good morning afternoon evening regards respectfully v/r vr sincerely get outlook ios android " +
    "microsoft teams team open members added join link click here new via item items know need needs let today tomorrow " +
    "week day days time date make made take may might must yes see attached email message meeting call phone cell office " +
    "one two three said say want use used using still back go going great awesome copy all everyone guys currently"
  ).split(/\s+/),
);

const QUOTED_HEADER_RE = /^(from|sent|to|cc|subject|importance):\s/i;
const URL_RE = /<?https?:\/\/[^\s>]+>?/gi;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;
const PHONE_RE = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

/** Remove quoted headers, URLs, emails, and phone numbers before tokenizing. */
function cleanBodyForConcepts(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !QUOTED_HEADER_RE.test(line.trim()) && !line.trim().startsWith(">"))
    .join("\n")
    .replace(URL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(PHONE_RE, " ");
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9'/-]{2,}/g) ?? []).filter(
    (t) => !STOPWORDS.has(t) && !/^\d+$/.test(t),
  );
}

interface TermStat {
  count: number;
  threads: Set<string>;
  isBigram: boolean;
}

// --- SOP / structured reference detection -----------------------------------

interface SopPattern {
  category: string;
  regex: RegExp;
  /** Label per match; if omitted the matched text (uppercased) is used. */
  label?: string;
}

const SOP_PATTERNS: SopPattern[] = [
  { category: "ASM message", regex: /\bGEN-\d{2,4}-\w{2,8}-\d{1,4}\b/gi },
  { category: "Report", regex: /\bDSR\b/g, label: "DSR" },
  { category: "Procedure", regex: /\bSOP\b/g, label: "SOP" },
  { category: "System link", regex: /vantage\.army\.mil/gi, label: "vantage.army.mil" },
];

// --- Graph assembly ----------------------------------------------------------

class LinkBag {
  private map = new Map<string, GraphLink>();

  add(source: string, target: string, type: LinkType): void {
    if (source === target) return;
    const key = `${type}|${source}|${target}`;
    const existing = this.map.get(key);
    if (existing) existing.weight += 1;
    else this.map.set(key, { source, target, type, weight: 1 });
  }

  toArray(): GraphLink[] {
    return [...this.map.values()];
  }
}

function pushUnique<T>(arr: T[], v: T): void {
  if (!arr.includes(v)) arr.push(v);
}

/** Build the full knowledge graph from parsed messages. */
export function analyze(messages: Message[], options: AnalyzeOptions = {}): GraphData {
  const opts = { ...DEFAULTS, ...options };

  const persons = new Map<string, GraphNode>();
  const threads = new Map<string, GraphNode>();
  const links = new LinkBag();

  const personNode = (p: Participant): GraphNode => {
    const id = `person:${p.key}`;
    let node = persons.get(id);
    if (!node) {
      node = {
        id,
        type: "person",
        label: p.displayName || p.key,
        fullLabel: p.fullName,
        count: 0,
        degree: 0,
        meta: { kind: "person", addresses: [], sentCount: 0, receivedCount: 0, messageIds: [] },
      };
      persons.set(id, node);
    }
    const meta = node.meta as PersonMeta;
    if (p.address) pushUnique(meta.addresses, p.address);
    // Prefer the cleanest (shortest cleaned) display name seen so far.
    if (p.displayName && (node.label === node.id || p.displayName.length < node.label.length)) {
      node.label = p.displayName;
      node.fullLabel = p.fullName;
    }
    return node;
  };

  // Pass 1: persons + threads + participation edges
  for (const msg of messages) {
    const normSubject = normalizeSubject(msg.subject) || "(no subject)";
    const threadId = `thread:${normSubject}`;
    let thread = threads.get(threadId);
    if (!thread) {
      thread = {
        id: threadId,
        type: "thread",
        label: normSubject.length > 48 ? `${normSubject.slice(0, 45)}…` : normSubject,
        fullLabel: msg.subject || "(no subject)",
        count: 0,
        degree: 0,
        meta: {
          kind: "thread",
          subject: msg.subject || "(no subject)",
          messageIds: [],
          participantKeys: [],
          approxDates: [],
          lowSignal: true,
        },
      };
      threads.set(threadId, thread);
    }
    const tMeta = thread.meta as ThreadMeta;
    thread.count += 1;
    tMeta.messageIds.push(msg.id);
    if (!msg.lowSignal) tMeta.lowSignal = false;
    const seenDate = msg.date ? new Date(msg.date).toLocaleDateString() : msg.approxDate;
    if (seenDate) pushUnique(tMeta.approxDates, seenDate);

    const participants: Participant[] = [];
    if (msg.from) participants.push(msg.from);
    participants.push(...msg.to, ...msg.cc);

    const seenInMsg = new Set<string>();
    for (const p of participants) {
      if (!p.key || seenInMsg.has(p.key)) continue;
      seenInMsg.add(p.key);
      const node = personNode(p);
      const pMeta = node.meta as PersonMeta;
      node.count += 1;
      pMeta.messageIds.push(msg.id);
      if (msg.from && p.key === msg.from.key) pMeta.sentCount += 1;
      else pMeta.receivedCount += 1;
      pushUnique(tMeta.participantKeys, p.key);
      links.add(node.id, threadId, "participated");
    }

    // Person–person co-occurrence within one message (toggleable in the UI).
    const keys = [...seenInMsg].sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        links.add(`person:${keys[i]}`, `person:${keys[j]}`, "cooccurs");
      }
    }
  }

  // Pass 2: concepts (frequency × thread spread, bigrams preferred)
  const terms = new Map<string, TermStat>();
  const bump = (term: string, threadId: string, isBigram: boolean) => {
    let stat = terms.get(term);
    if (!stat) {
      stat = { count: 0, threads: new Set(), isBigram };
      terms.set(term, stat);
    }
    stat.count += 1;
    stat.threads.add(threadId);
  };

  for (const msg of messages) {
    if (msg.lowSignal) continue;
    const threadId = `thread:${normalizeSubject(msg.subject) || "(no subject)"}`;
    const tokens = tokenize(`${msg.subject}\n${cleanBodyForConcepts(msg.body)}`);
    for (let i = 0; i < tokens.length; i++) {
      bump(tokens[i], threadId, false);
      if (i + 1 < tokens.length) bump(`${tokens[i]} ${tokens[i + 1]}`, threadId, true);
    }
  }

  const scored = [...terms.entries()]
    .filter(([, s]) => s.count >= 3 && s.threads.size >= 2)
    .map(([term, s]) => ({
      term,
      stat: s,
      score: s.count * s.threads.size * (s.isBigram ? 1.6 : 1),
    }))
    .sort((a, b) => b.score - a.score);

  const chosen: typeof scored = [];
  const chosenBigramParts = new Set<string>();
  for (const cand of scored) {
    if (chosen.length >= opts.maxConcepts) break;
    if (cand.stat.isBigram) {
      chosen.push(cand);
      for (const part of cand.term.split(" ")) chosenBigramParts.add(part);
    } else {
      // Skip unigrams already represented by a chosen bigram.
      if (chosenBigramParts.has(cand.term)) continue;
      chosen.push(cand);
    }
  }

  const concepts = new Map<string, GraphNode>();
  for (const { term, stat } of chosen) {
    const id = `concept:${term}`;
    concepts.set(id, {
      id,
      type: "concept",
      label: term,
      count: stat.threads.size,
      degree: 0,
      meta: { kind: "concept", threadIds: [...stat.threads], occurrences: stat.count },
    });
    for (const threadId of stat.threads) {
      if (threads.has(threadId)) links.add(threadId, id, "mentions");
    }
  }

  // Pass 3: SOP / structured references
  const sops = new Map<string, GraphNode>();
  for (const msg of messages) {
    const threadId = `thread:${normalizeSubject(msg.subject) || "(no subject)"}`;
    const text = `${msg.subject}\n${msg.body}`;
    for (const pat of SOP_PATTERNS) {
      pat.regex.lastIndex = 0;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = pat.regex.exec(text)) !== null) {
        const label = pat.label ?? m[0].toUpperCase();
        if (seen.has(label)) continue;
        seen.add(label);
        const id = `sop:${label.toLowerCase()}`;
        let node = sops.get(id);
        if (!node) {
          node = {
            id,
            type: "sop",
            label,
            fullLabel: `${pat.category}: ${label}`,
            count: 0,
            degree: 0,
            meta: { kind: "sop", category: pat.category, threadIds: [] },
          };
          sops.set(id, node);
        }
        node.count += 1;
        const sMeta = node.meta as SopMeta;
        pushUnique(sMeta.threadIds, threadId);
        if (threads.has(threadId)) links.add(threadId, id, "references");
        if (!pat.regex.global) break;
      }
    }
  }

  const nodes = [...persons.values(), ...threads.values(), ...concepts.values(), ...sops.values()];
  const allLinks = links.toArray();

  const degree = new Map<string, number>();
  for (const l of allLinks) {
    if (l.type === "cooccurs") continue; // optional layer; don't inflate sizing
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  for (const n of nodes) n.degree = degree.get(n.id) ?? 0;

  return { nodes, links: allLinks };
}
