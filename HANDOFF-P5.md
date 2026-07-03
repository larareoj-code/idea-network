# Phase 5 LLM Assistant — Handoff

**Branch:** `team/llm-assistant`
**Build:** 0 TypeScript errors, `vite build` clean
**Tests:** 81 pass / 4 pre-existing gitignored-data failures (unchanged from before P5)

---

## What was delivered

### D1 — Citation system (`src/lib/retrieval.ts`, `src/lib/llm.ts`)

- Added `Citation` interface to `retrieval.ts` (index, threadId, subject, from, snippet).
- Added `formatExcerptsWithCitations(excerpts, dataset)` — tags each excerpt `[N]` in the LLM context string and returns a parallel `Citation[]`. Resolves `threadId` by matching subject against graph thread nodes; falls back to `thread:<subject>` if no node found.
- `AssistantResult` in `llm.ts` now carries an optional `citations?: Citation[]` field.
- `askAssistant()` now calls `formatExcerptsWithCitations` instead of `formatExcerpts` and attaches citations to the result.
- `formatExcerpts` (legacy) is kept exported for the existing `retrieval.test.ts`.

### D2 — Provider setup cards (`src/components/ProviderSetup.tsx`)

- Card grid (2-column) with Groq / Gemini / OpenRouter / Ollama.
- Each card shows: name, free/local badge, description, key input (hidden for Ollama), editable model input pre-filled from preset defaults.
- "Use this provider" button writes config to both `idea-network:llm-provider` and `idea-network:llm-config:v1` localStorage keys.
- `AskPanel` loads `idea-network:llm-provider` first (falls back to old key) and replaces the old inline settings form with the card grid.
- Active provider shown as a status chip in the panel header.

### D3 — "Explain this graph" and "Draft query" modes (`src/lib/llm.ts`, `AskPanel.tsx`)

- `buildGraphSummary(visibleNodes, visibleLinks)` builds a structured text digest: node type counts, top-5 people by degree, top-5 threads by message count, top-5 concepts.
- `explainGraph(config, visibleNodes, visibleLinks)` sends the summary with a fixed "Describe key relationships" system prompt, streams the response.
- `draftQuery(config, description)` translates NL to DSL query string.
- `AskPanel` has a 3-button mode bar: **Ask** / **Explain this graph** / **Draft query**.
- App.tsx passes `visibleNodes` and `visibleLinks` from `visibleGraph` to AskPanel.

### D4 — Privacy notice (`AskPanel.tsx`)

- Before the first external API call (skipped for Ollama), shows a yellow banner.
- "Got it" button + "Don't show again" checkbox; dismiss state persisted to `idea-network:llm-privacy-ack`.
- If the user clicks a mode button that would trigger an API call while the banner is pending, the call is held until they dismiss.

### D5 — Test fixtures (`tests/llm.test.ts`)

17 new tests across 5 describe blocks:
- `retrieveMessages` result shape (messageId, score fields present; empty dataset; stopword-only query)
- `formatExcerptsWithCitations` produces `[1]`-tagged text, sequential numbering, correct subject/from/snippet, threadId fallback, empty-input graceful return
- threadId resolution against real graph nodes
- `buildGraphSummary` on a small synthetic graph and on an empty graph
- Integration tests on `public/demo-samples/inbox.csv` + `sent.csv`

---

## Files changed

| File | Change |
|---|---|
| `src/lib/retrieval.ts` | Added `Citation` interface, `formatExcerptsWithCitations()` |
| `src/lib/llm.ts` | Added `buildGraphSummary()`, `explainGraph()`, `draftQuery()`; updated `askAssistant()` to use citations; re-exported `Citation` |
| `src/components/ProviderSetup.tsx` | New — provider card grid UI |
| `src/components/AskPanel.tsx` | Rewrote to use ProviderSetup, citation rendering, mode bar, privacy banner |
| `src/App.tsx` | Pass `visibleNodes`/`visibleLinks` to AskPanel |
| `src/styles.css` | Added styles for provider cards, badges, mode bar, privacy banner, citations |
| `tests/llm.test.ts` | New — 17 tests for D5 |

---

## Known limitations / next steps

- Citations show the subject/sender of retrieved excerpts, not inline `[1]` markers within the answer text (the LLM is prompted to use `[N]` references but doesn't always comply — a post-processing regex to hyperlink `[N]` in the answer text would be a clean follow-up).
- "Explain this graph" streams as a plain-text answer (no JSON parsing) — no query/chart side-effects.
- Provider card grid is 2-column which may be tight in a narrow panel; a single-column stacked layout is a minor CSS tweak if needed.
