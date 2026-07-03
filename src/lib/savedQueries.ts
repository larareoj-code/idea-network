const STORAGE_KEY = "idea-network:saved-queries";

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

function readAll(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedQuery[]) : [];
  } catch {
    return [];
  }
}

function persist(queries: SavedQuery[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
  } catch {
    // storage unavailable
  }
}

export function saveQuery(name: string, query: string): SavedQuery {
  const entry: SavedQuery = {
    id: crypto.randomUUID(),
    name,
    query,
    createdAt: new Date().toISOString(),
  };
  const existing = readAll();
  existing.push(entry);
  persist(existing);
  return entry;
}

export function listQueries(): SavedQuery[] {
  return readAll();
}

export function deleteQuery(id: string): void {
  persist(readAll().filter((q) => q.id !== id));
}
