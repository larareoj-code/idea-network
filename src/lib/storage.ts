import type { Dataset } from "./types";
import { exportDatasetJson, importDatasetJson } from "./dataset";

/**
 * IndexedDB persistence for the current dataset. Replaces the old
 * localStorage store, which silently dropped anything over ~4.5 MB —
 * too small once PST ingestion landed. The dataset is stored as its
 * clean JSON export (force-graph mutates graph objects with circular
 * refs, so the raw object can't be structured-cloned).
 */

const DB_NAME = "idea-network";
const DB_VERSION = 1;
const STORE = "datasets";
const KEY = "current";
const LEGACY_LS_KEY = "idea-network:dataset:v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Best-effort save; failures are swallowed (persistence is a convenience). */
export async function saveDataset(dataset: Dataset): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(exportDatasetJson(dataset), KEY);
    await txDone(tx);
    db.close();
  } catch {
    // private mode / quota / blocked — skip silently
  }
}

/**
 * Load the persisted dataset. Migrates any legacy localStorage payload into
 * IndexedDB on first run, then removes it.
 */
export async function loadDataset(): Promise<Dataset | null> {
  let json: string | null = null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    json = await new Promise<string | null>((resolve, reject) => {
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    json = null;
  }

  if (!json) {
    try {
      json = localStorage.getItem(LEGACY_LS_KEY);
    } catch {
      json = null;
    }
  }
  if (!json) return null;

  try {
    const dataset = importDatasetJson(json);
    // Migration: ensure it lives in IndexedDB and clear the legacy copy.
    try {
      localStorage.removeItem(LEGACY_LS_KEY);
    } catch {
      // ignore
    }
    void saveDataset(dataset);
    return dataset;
  } catch {
    return null;
  }
}

export async function clearDataset(): Promise<void> {
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    await txDone(tx);
    db.close();
  } catch {
    // ignore
  }
}
