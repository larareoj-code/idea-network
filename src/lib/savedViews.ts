import type { NodeType } from "./types";

export interface SavedView {
  id: string;
  name: string;
  search: string;
  enabledTypes: NodeType[];
  showPersonLinks: boolean;
  hideNonMatching: boolean;
}

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
