# Idea Network v0.6 — Major Improvements Plan

**Status:** approved for execution
**Baseline:** commit `2cf6b4b` (v0.5 + background-click reset fix), 29/29 tests passing.

## Context

v0.1–v0.5 built the core loop: ingest Outlook exports (CSV/PST/MSG/EML) → extract
a Person/Thread/Concept/SOP graph → explore via force-directed canvas, query DSL,
charts, and an LLM assistant → persist in IndexedDB. A full independent review
passed with 0 blocking issues (fixed in v0.5). This plan addresses the gaps that
review and prior "future versions" notes flagged as structurally important, not
cosmetic: thread grouping is text-heuristic only, there's no clustering for the
network, large PSTs block the UI thread, the LLM answers from aggregate stats
rather than message content, and there's no theming/accessibility pass.

## Draft phases

### Phase 1 — Data Fidelity (graph structure)
- **Real thread reconstruction.** `.eml`/`.msg` carry `Message-ID`/`In-Reply-To`/
  `References` headers; CSV/PST typically don't. Build a reply-chain graph from
  those headers where available, falling back to today's normalized-subject
  grouping otherwise. Fixes: edited-subject replies splitting a thread, and
  unrelated messages with a coincidentally identical subject merging into one.
- **Community detection.** Label-propagation or simple greedy modularity over
  the person co-occurrence graph to assign each node a `communityId`. Adds a
  community color/legend mode, a `community:<n>` query filter, and a "community
  sizes" chart. Directly targets the 254-person Teams-distro hub called out in
  earlier reviews.
- Files: `src/lib/analyze.ts`, new `src/lib/threading.ts`, new
  `src/lib/communities.ts`, `src/lib/types.ts` (additive fields only),
  `src/lib/query.ts`, `src/lib/charts.ts`, tests.

### Phase 2 — Performance & Scale
- **Move parsing off the main thread.** PST/MSG/EML parsing currently blocks
  the UI; a large PST (thousands of messages) will freeze the tab. Wrap parsing
  in a Web Worker with progress callbacks; UI shows a progress bar instead of
  "Parsing…" with no feedback.
- **Canvas level-of-detail + keyboard navigation.** Cull/simplify rendering
  above a node-count threshold (skip per-frame label text, reduce link draws)
  so multi-thousand-node graphs stay interactive. Add arrow-key navigation
  between the selected node's neighbors and Enter-to-select, for both
  performance-conscious rendering and basic keyboard accessibility (owned
  together since both touch `GraphView.tsx`'s render loop).
- Files: new `src/workers/parseWorker.ts`, `src/lib/ingest.ts`,
  `vite.config.ts` (worker plugin config), `src/App.tsx` (progress state),
  `src/components/GraphView.tsx`, `src/components/UploadZone.tsx`.

### Phase 3 — LLM Intelligence
- **Grounded retrieval instead of a flat digest.** Today `buildDatasetContext`
  sends aggregate top-N stats to the LLM; it can't answer "what did Brent say
  about the swashplate" from actual message text. Add a lightweight local
  keyword/BM25-style retrieval over message bodies, feed the top-K relevant
  messages into the prompt alongside the existing digest.
- **Streaming responses + persisted conversation.** Stream tokens instead of
  waiting for the full completion; persist Ask AI history per dataset in
  IndexedDB (extends `storage.ts`) so it survives a reload like the graph does.
- Files: `src/lib/llm.ts`, new `src/lib/retrieval.ts`, `src/components/AskPanel.tsx`,
  `src/lib/storage.ts` (additive store), tests.

### Phase 4 — UX Polish
- **Light/dark theme toggle.** Currently dark-only; add a light theme via CSS
  custom properties and a toggle, persisted preference.
- **Saved views.** Named snapshots of current filters/search/isolation so users
  can jump between "just SOP refs," "Team X only," etc.
- Files: `src/styles.css`, new `src/lib/theme.ts`, new `src/lib/savedViews.ts`,
  `src/components/Sidebar.tsx`.

## Self-review

- **Scope check:** "major improvements across all aspects" is unbounded by
  nature; I selected four themes with concrete, testable success criteria
  instead of an open-ended backlog, prioritizing structural gaps a prior
  review already flagged over speculative polish.
- **File-ownership conflicts:** `GraphView.tsx` was originally split between a
  "performance" team and a "keyboard nav" team — merged into Phase 2 under one
  owner to avoid two agents editing the same render loop concurrently.
  `App.tsx` is touched by Phase 2 (progress state) and Phase 4 (theme toggle,
  saved-views wiring) — both additive/orthogonal hooks, low collision risk,
  and the orchestrator (this session) integrates and resolves any conflict
  after both branches land, running build+tests between merges.
- **Dependency check:** no phase depends on another's incomplete output — each
  can build and test in isolation against the v0.5 baseline. Query DSL and
  charts get small additive filters from Phase 1 (`community:`) but Phase 1
  owns those files, so no cross-team edit needed.
- **Risk flags:** Phase 2's Web Worker requires `structuredClone`-friendly
  data across the worker boundary (Message/Dataset types are already plain
  serializable objects — verified, no class instances crossing the boundary).
  Phase 3's retrieval must stay fully local (no message bodies sent anywhere
  except the user's own configured LLM endpoint, unchanged from v0.4/v0.5).
  Phase 1's community algorithm must run in bounded time on graphs up to
  ~1000 nodes (label propagation is near-linear; acceptable).
- **Execution model:** each phase runs in an isolated git worktree (agents
  editing the same working tree concurrently would corrupt each other's
  changes) on model **Fable 5**, per explicit instruction. Each team commits
  to its own branch; this session merges sequentially into `main`, running
  `npm run build` + `npx vitest run` after every merge, and resolves conflicts
  or spawns a targeted fix pass if a merge breaks tests.

## Stop condition

Loop exits when all four phases are merged, `npm run build` and `npx vitest run`
pass on `main`, and the app is verified live in the browser — or after the
integration pass if a phase can't be reconciled cleanly, in which case that
phase is reported as skipped/deferred rather than forced in.

## Team assignments (execution)

| Team | Branch | Scope |
|---|---|---|
| data-fidelity | `team/data-fidelity` | Phase 1 |
| performance | `team/performance` | Phase 2 |
| llm-intelligence | `team/llm-intelligence` | Phase 3 |
| ux-polish | `team/ux-polish` | Phase 4 |
