# Idea Network v0.7 — Graph Interaction & Control Layer

**Status:** approved for execution
**Baseline:** commit `b908934` (v0.6), 54/54 tests passing.

## Context

The user's request is large (10 sections) and already well-specified — this plan
maps it to concrete files rather than re-deriving requirements. Goal: turn the
graph from "a visualization you filter from the sidebar" into an interactive
knowledge map with its own control surface, per the user's explicit direction
to build a dedicated graph-controls layer instead of crowding the sidebar.

**What already exists (not rebuilt):** node-type show/hide chips, a query DSL
(`type:`/`from:`/`to:`/`with:`/`concept:`/`sop:`/`text:`/`community:`/
`min-degree:`/`min-count:`) with a "hide non-matching" toggle, double-click
isolate, node-degree sizing, community-colored data, arrow-key neighbor nav +
Enter-select, Ctrl+K command palette, basic saved views (search/types/
person-links/hide-toggle), a detail panel with per-type info and message
lists, canvas LOD above 1500 nodes.

**What's new in v0.7:** a floating graph control bar (zoom/fit/center/reset/
fullscreen/minimap), alternate layouts (cluster-by-type/source/thread,
timeline, degree-weighted), density sliders, edge controls, a richer inspector
panel with action buttons, saved-view presets + rename + camera/layout
capture, search result count + next/prev, new quick-filter chips, and
expanded command-palette actions.

## Why one team owns GraphView.tsx

v0.6's self-review caught and fixed a conflict from splitting `GraphView.tsx`
across two teams. This request has *five* sections (nav controls, layout
controls, density controls, edge controls, most of the interaction upgrades)
that all touch the same imperative canvas render loop and force-graph
instance. Splitting that further trades a small parallelism gain for real
merge risk in the highest-risk file in the app. It stays with one team.

## Draft phases

### Phase A — Graph Core & Controls (largest team)
- **Floating control bar** (new `GraphControls.tsx`): zoom in/out, fit-to-screen,
  center-on-selected, reset layout (re-run force sim from scratch), fullscreen
  toggle (CSS `:fullscreen` on the graph container), mini-map (best-effort: a
  small secondary low-res canvas in the bottom-right showing node positions +
  a viewport rectangle; click-to-pan is a stretch goal — if it proves too
  complex, ship the overview-only version and note the gap rather than block).
  These call an imperative API GraphView exposes via `useImperativeHandle`
  (zoomIn/zoomOut/fitToScreen/centerOn/resetLayout) — force-graph's own
  `zoom()`/`centerAt()`/`zoomToFit()` methods back these directly.
- **Layout controls** (new `GraphLayoutControls.tsx` + GraphView engine work):
  force-directed (default, unchanged), cluster-by-type/source/thread (inject a
  custom `forceX`/`forceY` anchor force per group via `fg.d3Force()`, one
  anchor point per group value, re-heat on change), timeline (only offered
  when the dataset has real dates — position by date on one axis via a
  forceX/forceY pinned to a date-derived coordinate), degree-weighted (radial
  force pulling high-degree nodes toward center). Each mode swaps which extra
  d3 forces are active; force-directed removes them.
- **Density controls** (new `GraphDensityControls.tsx`): sliders for node-size
  scale, label-visibility zoom threshold, edge opacity, link distance
  (`d3Force('link').distance()`), a label-mode toggle (always/hover-only/
  selected-only, replacing today's fixed heuristic), and collision strength
  (`d3Force('collide')`, not currently configured — add it).
- **Edge controls**: toggle all-edges visibility, opacity slider (shared with
  density controls — don't duplicate the control), thickness already scales
  with `weight` (keep, but make the scale slider-adjustable), per-link-type
  toggles (mentions/references/participated/cooccurs — cooccurs already has a
  toggle in Sidebar; extend the pattern for the other three), and a "hide
  weak links" threshold (weight cutoff).
- **Interaction upgrades** in `GraphView.tsx`: shift-click adds to a
  `multiSelectIds: Set<string>` (new, alongside the existing single
  `selectedId`); right-click opens a small context menu (Isolate/Pin/Hide/
  Expand neighbors — call the *same* handler props the inspector panel's
  buttons use, defined once in `App.tsx`, so there's one source of truth for
  each action); drag-to-pin (on `onNodeDragEnd`, fix `node.fx`/`node.fy` and
  record the id in a `pinnedIds` set — force-graph already fixes position
  during an active drag; verify whether it releases on drag-end by default
  before assuming, and make pinning explicit either way). Escape (reset) and
  single-click (inspect) are unchanged.
- **State ownership**: `layoutMode`, `densitySettings`, `pinnedIds`,
  `hiddenIds`, `multiSelectIds` are new App.tsx state, added additively (new
  `useState` calls + wiring into `visibleGraph`/props — no changes to
  existing handlers). Exposes the `pinnedIds`/`hiddenIds` setters as props so
  Phase B's inspector buttons can call them without owning the state.
- Files: `src/components/GraphView.tsx` (sole owner), new
  `GraphControls.tsx`, `GraphLayoutControls.tsx`, `GraphDensityControls.tsx`,
  `src/App.tsx` (additive only).

### Phase B — Inspector & Saved Views
- **Richer `DetailPanel.tsx`**: add connection count (already `node.degree`,
  just surface it prominently), related people/threads/concepts sections
  (partially exist — extend to cover concept/SOP nodes' related people, not
  just related threads), source files list (from `message.source` across the
  node's messages), first/last seen (from `Message.date`/`approxDate` where
  present, else "unknown — CSV source has no dates"). Add action buttons:
  Isolate (existing behavior, now also reachable from the panel), Expand
  neighbors (temporarily reveal the node's neighbors even if filtered out by
  type/query — a new prop callback), Pin (calls the `pinnedIds` setter Phase A
  exposes; show a pinned badge when active), Hide (calls the `hiddenIds`
  setter), Open source ("Open source" in a browser sandbox realistically means
  *reveal originating file name / jump to the message* — implement it as
  scrolling to / highlighting the relevant source in the message list, not an
  OS file launch; make this scope explicit in the UI copy).
- **Saved views**: extend `SavedView` (types.ts stays in savedViews.ts) with
  optional `layoutMode`, `densitySettings`, and `camera: {x,y,zoom}` fields —
  additive, old saved views without these fields still load. Add
  `renameView(id, name)`. Add five built-in presets (People map, Concept map,
  Thread clusters, SOP references, High-signal nodes only) as constants with
  a `preset: true` flag — shown in the Views list but not editable/deletable.
  Sidebar's Views section gets a rename control and lists presets first.
- Files: `src/components/DetailPanel.tsx`, `src/lib/savedViews.ts`,
  `src/components/Sidebar.tsx` (Views section only — do not touch node-type
  chips or other existing Sidebar sections), small additive `App.tsx` prop
  plumbing for the new callbacks (pass-through only, the state itself is
  Phase A's).

### Phase C — Search, Quick Filters & Command Palette
- **Search improvements**: result count and next/prev navigation over the
  existing `matchIds` set (cycle `selectedId` through matches) — new floating
  `GraphSearch.tsx` pill near the top of the canvas (the user's suggested
  component list keeps this separate from the Sidebar's basic filters).
  Extend the query DSL: `source:<name>` (message source file), `via:<type>`
  (nodes touching a link of that type — reinterprets "relationship type"
  search since links aren't independently labeled text), `after:`/`before:`
  (date range using `Message.date`, graceful no-op on CSV-only datasets that
  lack dates).
- **Quick filters** (new floating `GraphFilters.tsx`, chip row): "Neighborhood
  only" (continuously restrict to selected node + neighbors — distinct from
  isolate, which is a one-shot double-click state), "High-degree only"
  (one-click wrapper around a degree threshold), "Isolated clusters" (find
  connected components disconnected from the largest component, offer to
  show only those), "Hide low-connection nodes" (degree ≤ 1), "Hide selected
  node type" (one click hides whichever type the current selection is). Focus
  mode (dim instead of hide) already exists implicitly via selection
  highlighting — add an explicit toggle formalizing it as a named mode.
- **Command palette** (`CommandPalette.tsx`): add actions — "Show only
  concepts", "Hide people", "Focus selected cluster", "Reset graph" (exists,
  keep), "Export visible graph" (new: export the *currently filtered*
  subgraph as JSON, distinct from the existing full-dataset export), "Save
  current view", "Find orphan nodes" (degree 0), "Show strongest connections"
  (top-N by link weight, selects/highlights them).
- Files: `src/lib/query.ts`, new `GraphSearch.tsx`, `GraphFilters.tsx`,
  `src/components/CommandPalette.tsx`, additive `App.tsx` state (quick-filter
  flags, search navigation index) and `visibleGraph` memo extension.

## Self-review

- **Scope check**: descoped two items explicitly rather than half-build them:
  mini-map click-to-pan is a stretch goal (overview-only is the floor); "Open
  source" is redefined to what a browser sandbox can actually do (reveal/jump
  to message, not launch a file handler) — stated up front so the team
  doesn't invent something misleading.
- **File-ownership conflicts**: `GraphView.tsx` is Phase A's alone (see
  rationale above). `Sidebar.tsx` is Phase B's alone, scoped to the Views
  section only. `App.tsx` is touched additively by all three phases (new
  state + prop wiring, no edits to existing handlers) — same pattern that
  merged cleanly three ways in v0.6; the orchestrator integrates and
  build/tests between each merge.
- **Cross-team contracts fixed in advance** (so independent agents converge
  without talking to each other): Pin/Hide/Expand-neighbors are *state in
  App.tsx, owned by Phase A*, exposed as setter props; Phase B's inspector
  buttons and Phase A's right-click menu both call the same props — one
  source of truth, no duplicate logic. `SavedView`'s new optional fields are
  specified in this doc so Phase A (which owns layoutMode/densitySettings/
  camera) and Phase B (which owns save/apply UI) agree on field names without
  needing to read each other's code.
- **Risk flags**: custom d3 forces for cluster/timeline layouts must be
  removed cleanly when switching back to force-directed, or leftover forces
  will corrupt future layouts — Phase A must verify forces are actually
  removed (`fg.d3Force(name, null)`), not just overridden. Drag-to-pin's
  default force-graph behavior must be verified against the installed
  version's actual behavior before assuming a bug exists there, same
  discipline as prior reviews.
- **Dependency check**: Phase B and C only depend on prop *contracts* Phase A
  defines (documented above), not on Phase A's code being finished first —
  all three can build and test against the v0.6 baseline independently, with
  the setter props' actual implementations landing when Phase A merges.

## Stop condition

All three phases merged, `npm run build` and `npx vitest run` pass on `main`,
verified live in the browser (dense-graph scenario: load the sample data,
exercise the new controls). Any sub-item that can't be reconciled cleanly is
reported as deferred rather than forced in.

## Team assignments

| Team | Branch | Scope |
|---|---|---|
| graph-core | `team/graph-core` | Phase A |
| inspector-views | `team/inspector-views` | Phase B |
| search-filters | `team/search-filters` | Phase C |
