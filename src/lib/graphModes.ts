import type { NodeType, LinkType } from "./types";
import type { LayoutMode } from "./graphForces";

export type GraphMode = "overview" | "people" | "concepts" | "threads" | "sop" | "timeline";

export interface GraphModeConfig {
  label: string;
  description: string;
  enabledTypes: Set<NodeType>;
  layoutMode: LayoutMode;
  enabledLinkTypes: Set<Exclude<LinkType, "cooccurs">>;
}

export const GRAPH_MODES: Record<GraphMode, GraphModeConfig> = {
  overview: {
    label: "Overview",
    description: "All node types and links",
    enabledTypes: new Set(["person", "thread", "concept", "sop"]),
    layoutMode: "force",
    enabledLinkTypes: new Set(["participated", "mentions", "references"]),
  },
  people: {
    label: "People map",
    description: "Persons and their email threads",
    enabledTypes: new Set(["person", "thread"]),
    layoutMode: "force",
    enabledLinkTypes: new Set(["participated"]),
  },
  concepts: {
    label: "Concept map",
    description: "Concepts, SOPs, and threads that reference them",
    enabledTypes: new Set(["concept", "sop", "thread"]),
    layoutMode: "force",
    enabledLinkTypes: new Set(["mentions", "references"]),
  },
  threads: {
    label: "Thread clusters",
    description: "Threads and participants grouped by community",
    enabledTypes: new Set(["thread", "person"]),
    layoutMode: "clusterType",
    enabledLinkTypes: new Set(["participated"]),
  },
  sop: {
    label: "SOP references",
    description: "SOPs and concepts linked by document references",
    enabledTypes: new Set(["sop", "concept"]),
    layoutMode: "force",
    enabledLinkTypes: new Set(["references"]),
  },
  timeline: {
    label: "Timeline",
    description: "Threads ordered by date (requires dated messages)",
    enabledTypes: new Set(["thread"]),
    layoutMode: "timeline",
    enabledLinkTypes: new Set(["participated"]),
  },
};

export const GRAPH_MODE_ORDER: GraphMode[] = [
  "overview",
  "people",
  "concepts",
  "threads",
  "sop",
  "timeline",
];
