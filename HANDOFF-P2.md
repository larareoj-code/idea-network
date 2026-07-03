# HANDOFF-P2 — Phase 2 Graph Interaction Upgrade

**Branch:** `team/graph-upgrade`
**Build:** passing (`tsc && vite build`, exit 0)
**Tests:** 53 passed / 4 skipped (pre-existing: require real `data/*.CSV` files not in repo)

---

## What Was Implemented

### Deliverable 1: Graph Mode Switcher — DONE
- `src/lib/graphModes.ts` — 6 mode presets: overview, people, concepts, threads, sop, timeline
- `src/components/GraphModeBar.tsx` — grid of mode buttons with active state and reset (×) button
- `src/App.tsx` — `graphMode` state + `applyGraphMode(mode)` sets `enabledTypes`, `layoutMode`, `enabledLinkTypes` atomically; `GraphModeBar` rendered in graph-side panel

### Deliverable 2: Rich Hover Tooltips — DONE
- `GraphView.tsx` `.nodeLabel()` returns HTML with type badge (color-coded), degree count, and type-specific meta:
  - person: Sent / Received counts
  - thread: message count + participant count
  - concept/sop: thread count
- Styled in `styles.css` via `.node-tooltip`, `.tt-header`, `.tt-badge`, `.tt-row`

### Deliverable 3: Multi-Select Action Bar — DONE
- Shift+click adds/removes nodes from `multiSelectIds`
- Cyan ring renders around selected nodes
- When `multiSelectIds.size > 0`, action bar shows: **N selected — Hide all | Pin all | Clear**
- Escape clears selection

### Deliverable 4: Right-Click Context Menu — DONE
- Menu items: **Select**, Isolate neighborhood, Pin/Unpin, Hide node, Expand neighbors, **Copy label**
- `nodeLabel` stored in menu state so clipboard write works without a node lookup
- `navigator.clipboard.writeText()` used for Copy label (HTTPS or localhost required)

### Deliverable 5: Drag-to-Pin — DONE (pre-existing)
- `onNodeDragEnd` pins node by fixing `fx`/`fy`
- Pin indicator (amber dot) renders at node upper-right
- **Double-click on a pinned node now unpins it** (instead of triggering isolate)

### Deliverable 6: Edge Type Toggles — DONE (pre-existing)
- `GraphDensityControls` has participated / mentions / references toggles
- `visibleGraph` memo filters by `enabledLinkTypes`

---

## Files Changed

| File | Change |
|---|---|
| `src/lib/graphModes.ts` | New — 6 mode presets |
| `src/components/GraphModeBar.tsx` | New — mode switcher UI |
| `src/components/GraphView.tsx` | Rich tooltip, context menu (Select + Copy label), double-click-to-unpin |
| `src/App.tsx` | graphMode state, applyGraphMode, multi-select bar |
| `src/styles.css` | mode grid, multi-select bar, tooltip styles, context menu |

---

## Known Gaps / Follow-Up

- `Copy label` requires a secure context (HTTPS or localhost). Silently no-ops on plain HTTP.
- Timeline mode requires dated messages (PST/MSG/EML). The button is disabled when `hasDates` is false.
- The 4 failing test files need real `data/*.CSV` exports — not related to Phase 2 changes.
