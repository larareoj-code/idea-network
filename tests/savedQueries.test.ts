import { beforeEach, describe, expect, it } from "vitest";
import { deleteQuery, listQueries, saveQuery } from "../src/lib/savedQueries";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
});

describe("savedQueries", () => {
  it("returns empty list when nothing stored", () => {
    expect(listQueries()).toEqual([]);
  });

  it("saveQuery persists and listQueries returns it", () => {
    const q = saveQuery("My query", "type:concept");
    expect(q.name).toBe("My query");
    expect(q.query).toBe("type:concept");
    expect(q.id).toBeTruthy();
    expect(q.createdAt).toBeTruthy();

    const list = listQueries();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(q);
  });

  it("saves multiple queries and lists them in order", () => {
    saveQuery("Alpha", "from:alice");
    saveQuery("Beta", "to:bob");
    const list = listQueries();
    expect(list).toHaveLength(2);
    expect(list.map((q) => q.name)).toEqual(["Alpha", "Beta"]);
  });

  it("deleteQuery removes the matching entry", () => {
    const a = saveQuery("A", "type:person");
    const b = saveQuery("B", "type:thread");
    deleteQuery(a.id);
    const list = listQueries();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
  });

  it("deleteQuery on unknown id is a no-op", () => {
    saveQuery("X", "type:sop");
    deleteQuery("no-such-id");
    expect(listQueries()).toHaveLength(1);
  });

  it("each saved query gets a unique id", () => {
    saveQuery("Q1", "from:alice");
    saveQuery("Q2", "from:alice");
    const ids = listQueries().map((q) => q.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("survives corrupted storage", () => {
    store.set("idea-network:saved-queries", "not json{");
    expect(listQueries()).toEqual([]);
    saveQuery("Recovered", "type:concept");
    expect(listQueries()).toHaveLength(1);
  });
});
