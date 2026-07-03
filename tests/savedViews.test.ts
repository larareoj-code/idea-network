import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteView,
  listSavedViews,
  PRESET_VIEWS,
  renameView,
  saveView,
  type SavedView,
} from "../src/lib/savedViews";

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

  it("renames an existing view and preserves the rest", () => {
    saveView(view("a", "Old name"));
    saveView(view("b", "Other"));
    const result = renameView("a", "New name");
    expect(result.find((v) => v.id === "a")?.name).toBe("New name");
    expect(listSavedViews().map((v) => v.name).sort()).toEqual(["New name", "Other"]);
    const renamed = listSavedViews().find((v) => v.id === "a")!;
    expect(renamed.search).toBe("type:concept");
    expect(renamed.enabledTypes).toEqual(["person", "concept"]);
  });

  it("renaming a missing id is a no-op", () => {
    saveView(view("a", "Kept"));
    expect(renameView("nope", "Whatever").map((v) => v.name)).toEqual(["Kept"]);
  });

  it("old saved views without new optional fields still load", () => {
    store.set("idea-network-saved-views", JSON.stringify([view("legacy", "Legacy")]));
    const loaded = listSavedViews()[0];
    expect(loaded.name).toBe("Legacy");
    expect(loaded.layoutMode).toBeUndefined();
    expect(loaded.camera).toBeUndefined();
  });

  it("exposes five built-in presets flagged and not persisted", () => {
    expect(PRESET_VIEWS).toHaveLength(5);
    for (const p of PRESET_VIEWS) {
      expect(p.preset).toBe(true);
      expect(p.id).toMatch(/^preset:/);
      expect(p.name).toBeTruthy();
      expect(p.enabledTypes.length).toBeGreaterThan(0);
    }
    expect(PRESET_VIEWS.map((p) => p.name)).toEqual([
      "People map",
      "Concept map",
      "Thread clusters",
      "SOP references",
      "High-signal nodes only",
    ]);
    expect(PRESET_VIEWS.find((p) => p.id === "preset:high-signal")?.search).toBe("min-degree:2");
    expect(listSavedViews()).toEqual([]);
  });

  it("survives corrupted storage", () => {
    store.set("idea-network-saved-views", "not json{");
    expect(listSavedViews()).toEqual([]);
    saveView(view("a", "Recovered"));
    expect(listSavedViews()).toHaveLength(1);
  });
});
