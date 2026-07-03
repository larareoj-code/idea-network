# Phase 4 Import Trust — Handoff

Branch: `team/import-trust`

## What was built

### 1. `src/lib/importSummary.ts`
New module exporting `FileSummary`, `ImportSummary` types and `buildImportSummary()`.

- `FileSummary` per file: message count, skipped count, date range, external domains, warnings.
- `ImportSummary` across batch: totals, `dedupeCount`, `parseErrors`.
- `dedupeCount` mirrors `mergeDataset`'s `seen` Set logic — counts cross-batch duplicates (against `prevDataset`) plus intra-batch duplicates.
- `externalDomains`: identifies the dominant sender domain as "internal"; flags recipient-only domains as external.
- `warnings`: emits a human-readable string when messages lack both `date` and `approxDate`.

### 2. `src/components/ImportReviewPanel.tsx`
Modal overlay shown after parsing, before graph commit.

- Per-file table with message count, date range, warning badges (yellow), external domain badges (red).
- Summary totals: messages, nodes, edges, dedupe drops.
- Collapsible parse errors list.
- "Always skip review" checkbox → `localStorage` key `idea-network:skip-import-review`.
- `shouldSkipReview()` export read by App.tsx to auto-confirm without showing the panel.

### 3. `src/App.tsx` wiring
- Added `pendingItems`, `pendingErrors`, `importSummary` state.
- `ingestItems()` now stages items instead of committing; if `shouldSkipReview()` it commits immediately.
- Inside `setDataset` functional updater: builds a preview dataset → `buildImportSummary` → sets pending state via `setTimeout` (avoids nested state updates).
- `onConfirmImport` / `onCancelImport` callbacks clean up pending state.
- `<ImportReviewPanel>` rendered at the bottom of `<main>` when `importSummary` is set.

### 4. `src/components/DetailPanel.tsx` source lineage
- `sourcesSection` now renders a two-column grid showing per-source: filename, message count, date range (first → last seen, or "no dates").
- Uses existing `seenRange()` helper per-source rather than globally.

### 5. `tests/importSummary.test.ts`
6 tests covering:
- Full pipeline on `data/Inbox Export.CSV` without throwing
- `dedupeCount === 0` on fresh import
- `dedupeCount === N` when same data imported twice
- `externalDomains` populated for cross-domain recipients
- `warnings` mentions "missing date" for undated messages
- `parseErrors` pass-through

## Build & test status
- `npm run build` — clean (only pre-existing chunk size warning)
- `npm test` — 91/91 passed

## Known limitations / follow-up
- The `setTimeout` trick inside the `setDataset` functional updater is a pragmatic workaround for React's constraint on setState-inside-setState. Consider refactoring `ingestItems` to a two-phase approach (parse → stage, confirm → commit) that doesn't need a functional updater at all.
- `data/` CSV files are gitignored; tests require them to be copied from the main checkout before running in CI.
- The chunk size warning (741 kB) predates this phase — no new large deps were added.
