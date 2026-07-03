# Phase 1 UX Shell — Handoff

## What Was Done

### 1. Three-path first-run screen (`FirstRunScreen`)
- Added to `src/components/UploadZone.tsx`
- Shows when `dataset` is null and `booting` is false
- Three cards: Load demo / Import Outlook export / Reopen saved graph
- "Reopen saved graph" is disabled (greyed out) when IndexedDB has no prior session
- SVG inline icons on each card; dark theme matches app
- `hasSaved` flag set during the IndexedDB boot load in `App.tsx`

### 2. App shell refactor (CSS grid)
- `.app` is now a `grid` with `grid-template-areas: "topbar topbar" / "sidebar main"`
- Top bar (`.topbar`) spans full width: sidebar toggle (hamburger), app name, version badge, theme toggle, command palette trigger
- `.app.sidebar-closed` collapses the sidebar column to `0` with a 0.2s transition
- Sidebar visibility toggled via `sidebarOpen` state in `App.tsx`
- The `.brand` block inside `Sidebar.tsx` is hidden (`display: none`) — brand/version/theme live in the top bar
- Theme toggle state lifted to `App.tsx` (was only in `Sidebar.tsx`)
- Graph workspace fills remaining grid cell; detail panels overlay (unchanged from before)

### 3. Empty and loading states
- **Boot spinner**: `booting === true` renders `.loading-screen` with a CSS `@keyframes spin` spinner
- **Parse progress bar**: while `loading && parseProgress`, an overlay appears at the bottom of `.main` showing file name + animated fill bar
- **Cleared empty state**: `dataset === null && !booting` (after clear) renders `.cleared-empty` with a faint graph icon and "No graph loaded — drop files or load the demo" + a "Load demo" button. This is now distinct from the first-run screen (first-run only shows on initial load when `hasSaved` was checked at boot)

### 4. Visual hierarchy / button system
- `.btn-icon` class added: 32×32 square, transparent background, border on hover — used for topbar controls
- `:focus-visible` global ring (2px solid `--accent`, offset 2px) applied across all interactive elements
- `button:focus:not(:focus-visible)` suppresses focus ring on mouse click

## Changed Files

| File | Change |
|---|---|
| `src/App.tsx` | Grid shell, topbar, sidebar toggle, `hasSaved`/`theme` state, `FirstRunScreen`, spinner, progress bar, cleared empty |
| `src/components/UploadZone.tsx` | Added `FirstRunScreen` export (existing `EmptyState`/`DropOverlay` preserved) |
| `src/styles.css` | Grid layout, topbar, `btn-icon`, `focus-visible`, spinner, progress overlay, first-run, cleared empty, `.brand { display: none }` |
| `HANDOFF-P1.md` | This file |

## Test Commands

```
npm run build    # TypeScript + Vite — must pass with no errors
npm test         # 53 tests pass; 3 pre-existing failures (data/Inbox Export.CSV is gitignored)
```

## Known Gaps

- **Sidebar theme toggle duplication**: `Sidebar.tsx` still owns its own `theme` state internally (for the hidden `.brand` block). It won't cause visual bugs (brand is hidden) but the internal state is now dead. A future cleanup should either remove the brand block from `Sidebar.tsx` entirely or accept a `theme` prop.
- **Right panel overlay on mobile**: the detail panels (DetailPanel, ChartsPanel, AskPanel) already use `position: absolute` overlay behavior; no mobile backdrop was added. The spec said "semi-transparent backdrop on mobile only" — deferred.
- **Progress bar during sample load**: `onLoadSamples` fetches demo CSVs via `fetch()` but doesn't call `setParseProgress`, so the progress bar won't appear during demo load. Only multi-file `parseFiles()` ingestion sets progress.
