import type { NodeType } from "./types";

export interface SavedView {
  id: string;
  name: string;
  search: string;
  enabledTypes: NodeType[];
  showPersonLinks: boolean;
  hideNonMatching: boolean;
  layoutMode?: string;
  densitySettings?: Record<string, number>;
  camera?: { x: number; y: number; zoom: number };
  preset?: boolean;
}

const ALL_TYPES: NodeType[] = ["person", "thread", "concept", "sop"];

// Built-in presets, listed above user-saved views in the UI. Not persisted.
export const PRESET_VIEWS: SavedView[] = [
  {
    id: "preset:people-map",
    name: "People map",
    search: "",
    enabledTypes: ["person"],
    showPersonLinks: true,
    hideNonMatching: false,
    preset: true,
  },
  {
    id: "preset:concept-map",
    name: "Concept map",
    search: "",
    enabledTypes: ["concept"],
    showPersonLinks: false,
    hideNonMatching: false,
    preset: true,
  },
  {
    id: "preset:thread-clusters",
    name: "Thread clusters",
    search: "",
    enabledTypes: ["thread"],
    showPersonLinks: false,
    hideNonMatching: false,
    preset: true,
  },
  {
    id: "preset:sop-references",
    name: "SOP references",
    search: "",
    enabledTypes: ["sop"],
    showPersonLinks: false,
    hideNonMatching: false,
    preset: true,
  },
  {
    id: "preset:high-signal",
    name: "High-signal nodes only",
    search: "min-degree:2",
    enabledTypes: ALL_TYPES,
    showPersonLinks: false,
    hideNonMatching: true,
    preset: true,
  },
];

const STORAGE_KEY = "idea-network-saved-views";

export function listSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persist(views: SavedView[]): SavedView[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // Storage unavailable — caller still gets the in-memory list.
  }
  return views;
}

export function saveView(view: SavedView): SavedView[] {
  const views = listSavedViews().filter((v) => v.id !== view.id);
  views.push(view);
  return persist(views);
}

export function deleteView(id: string): SavedView[] {
  return persist(listSavedViews().filter((v) => v.id !== id));
}

export function renameView(id: string, name: string): SavedView[] {
  return persist(listSavedViews().map((v) => (v.id === id ? { ...v, name } : v)));
}
