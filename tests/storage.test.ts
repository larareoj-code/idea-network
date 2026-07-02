import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal in-memory IndexedDB stub — vitest runs in a plain node environment
 * with no indexedDB, and adding fake-indexeddb would be a new dependency.
 * Implements only what storage.ts touches.
 */
interface MemDb {
  version: number;
  stores: Map<string, Map<IDBValidKey, unknown>>;
}
const databases = new Map<string, MemDb>();

function installFakeIndexedDb(): void {
  (globalThis as Record<string, unknown>).indexedDB = {
    open(name: string, version: number) {
      const req: {
        result?: unknown;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      queueMicrotask(() => {
        let db = databases.get(name);
        if (!db) {
          db = { version: 0, stores: new Map() };
          databases.set(name, db);
        }
        const mem = db;
        req.result = {
          objectStoreNames: { contains: (s: string) => mem.stores.has(s) },
          createObjectStore(s: string) {
            mem.stores.set(s, new Map());
          },
          transaction() {
            const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: (n: string) => unknown } = {
              objectStore(n: string) {
                const store = mem.stores.get(n)!;
                return {
                  put(value: unknown, key: IDBValidKey) {
                    store.set(key, value);
                  },
                  delete(key: IDBValidKey) {
                    store.delete(key);
                  },
                  get(key: IDBValidKey) {
                    const getReq: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
                    queueMicrotask(() => {
                      getReq.result = store.get(key);
                      getReq.onsuccess?.();
                    });
                    return getReq;
                  },
                };
              },
            };
            queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
            return tx;
          },
          close() {},
        };
        if (version > mem.version) {
          mem.version = version;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
}

installFakeIndexedDb();

const { saveAskHistory, loadAskHistory, clearAskHistory } = await import("../src/lib/storage");

describe("ask history persistence", () => {
  beforeEach(() => {
    databases.clear();
  });

  it("round-trips history entries", async () => {
    const entries = [
      { id: 0, question: "Who sends the most?", result: { answer: "Alice", query: "type:person alice" } },
      { id: 1, question: "Broken one", error: "Rate limited (429)" },
    ];
    await saveAskHistory(entries);
    const loaded = await loadAskHistory();
    expect(loaded).toEqual(entries);
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadAskHistory()).toBeNull();
  });

  it("clears stored history", async () => {
    await saveAskHistory([{ id: 0, question: "q", result: { answer: "a" } }]);
    await clearAskHistory();
    expect(await loadAskHistory()).toBeNull();
  });

  it("creates both object stores on upgrade without touching dataset data", async () => {
    await saveAskHistory([{ id: 0, question: "q", result: { answer: "a" } }]);
    const db = databases.get("idea-network")!;
    expect(db.version).toBe(2);
    expect(db.stores.has("datasets")).toBe(true);
    expect(db.stores.has("askHistory")).toBe(true);
    expect(db.stores.get("datasets")!.size).toBe(0);
  });
});
