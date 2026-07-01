export interface Participant {
  /** Stable identity key: lowercased email or trailing DN segment. */
  key: string;
  /** Raw display name from the CSV. */
  fullName: string;
  /** Cleaned "First Last" style name for display. */
  displayName: string;
  /** Raw address (SMTP or Exchange DN). */
  address: string;
}

export interface Message {
  /** Content hash of subject+body+from, used for dedupe. */
  id: string;
  subject: string;
  body: string;
  from: Participant | null;
  to: Participant[];
  cc: Participant[];
  importance: string;
  categories: string;
  /** Source file this message came from. */
  source: string;
  /** True for Teams auto-notifications and similar boilerplate. */
  lowSignal: boolean;
  /**
   * Approximate date scraped from a quoted "Sent:" header inside the body.
   * Outlook CSV exports contain no date column, so this is best-effort only.
   */
  approxDate?: string;
}

export type NodeType = "person" | "thread" | "concept" | "sop";

export interface GraphNode {
  id: string;
  type: NodeType;
  /** Short label rendered on the canvas. */
  label: string;
  /** Full label for tooltips / detail panel. */
  fullLabel?: string;
  /** Number of messages (person/thread) or occurrences (concept/sop). */
  count: number;
  /** Edge count, used for node sizing. */
  degree: number;
  /** Extra type-specific data. */
  meta: NodeMeta;
}

export interface PersonMeta {
  kind: "person";
  addresses: string[];
  sentCount: number;
  receivedCount: number;
  messageIds: string[];
}

export interface ThreadMeta {
  kind: "thread";
  subject: string;
  messageIds: string[];
  participantKeys: string[];
  approxDates: string[];
  lowSignal: boolean;
}

export interface ConceptMeta {
  kind: "concept";
  threadIds: string[];
  occurrences: number;
}

export interface SopMeta {
  kind: "sop";
  category: string;
  threadIds: string[];
}

export type NodeMeta = PersonMeta | ThreadMeta | ConceptMeta | SopMeta;

export type LinkType = "participated" | "mentions" | "references" | "cooccurs";

export interface GraphLink {
  source: string;
  target: string;
  type: LinkType;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface SourceInfo {
  name: string;
  messageCount: number;
}

export interface Dataset {
  schemaVersion: 1;
  generatedAt: string;
  sources: SourceInfo[];
  messages: Message[];
  graph: GraphData;
}
