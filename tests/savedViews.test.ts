import { beforeEach, describe, expect, it } from "vitest";
import { deleteView, listSavedViews, saveView, type SavedView } from "../src/lib/savedViews";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
});

const view = (id: string, name: string): SavedView => ({
  id,
  name,
  search: "type:concept",
  enabledTypes: ["person", "concept"],
  showPersonLinks: true,
  hideNonMatching: false,
});

describe("savedViews", () => {
  it("returns empty list when nothing stored", () => {
    expect(listSavedViews()).toEqual([]);
  });

  it("round-trips save → list → delete", () => {
    saveView(view("a", "Concepts only"));
    saveView(view("b", "Team X"));
    expect(listSavedViews().map((v) => v.name)).toEqual(["Concepts only", "Team X"]);

    const loaded = listSavedViews()[0];
    expect(loaded).toEqual(view("a", "Concepts only"));

    deleteView("a");
    expect(listSavedViews().map((v) => v.id)).toEqual(["b"]);
    deleteView("b");
    expect(listSavedViews()).toEqual([]);
  });

  it("saving with an existing id replaces the view", () => {
    saveView(view("a", "Before"));
    saveView(view("a", "After"));
    const views = listSavedViews();
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe("After");
  });

  it("survives corrupted storage", () => {
    store.set("idea-network-saved-views", "not json{");
    expect(listSavedViews()).toEqual([]);
    saveView(view("a", "Recovered"));
    expect(listSavedViews()).toHaveLength(1);
  });
});
