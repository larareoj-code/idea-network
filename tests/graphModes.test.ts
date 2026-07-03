import { describe, expect, it } from "vitest";
import { GRAPH_MODE_ORDER, GRAPH_MODES } from "../src/lib/graphModes";

describe("graphModes", () => {
  it("all 6 modes exist in GRAPH_MODES", () => {
    expect(GRAPH_MODE_ORDER).toHaveLength(6);
    for (const m of GRAPH_MODE_ORDER) {
      expect(GRAPH_MODES[m]).toBeDefined();
    }
  });

  it("each mode has non-empty enabledTypes and enabledLinkTypes", () => {
    for (const m of GRAPH_MODE_ORDER) {
      const cfg = GRAPH_MODES[m];
      expect(cfg.enabledTypes.size).toBeGreaterThan(0);
      expect(cfg.enabledLinkTypes.size).toBeGreaterThan(0);
      expect(cfg.layoutMode.length).toBeGreaterThan(0);
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });

  it("overview mode enables all 4 node types", () => {
    const cfg = GRAPH_MODES["overview"];
    expect(cfg.enabledTypes.has("person")).toBe(true);
    expect(cfg.enabledTypes.has("thread")).toBe(true);
    expect(cfg.enabledTypes.has("concept")).toBe(true);
    expect(cfg.enabledTypes.has("sop")).toBe(true);
  });

  it("timeline mode has layoutMode === 'timeline'", () => {
    expect(GRAPH_MODES["timeline"].layoutMode).toBe("timeline");
  });

  it("people mode only enables person and thread types", () => {
    const cfg = GRAPH_MODES["people"];
    expect(cfg.enabledTypes.has("person")).toBe(true);
    expect(cfg.enabledTypes.has("thread")).toBe(true);
    expect(cfg.enabledTypes.has("concept")).toBe(false);
    expect(cfg.enabledTypes.has("sop")).toBe(false);
  });
});
