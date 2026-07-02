# Idea Network

A fully client-side, dark-themed single-page app that ingests Microsoft Outlook CSV
exports and renders an interactive knowledge network of **people**, **conversation
threads**, **concepts/topics**, and **SOP / structured data references** extracted
from email.

## Run

```
npm install
npm run dev      # dev server
npm run build    # type-check + production build (dist/)
npm test         # vitest — parses the real CSVs in data/ and validates the pipeline
```

Open the dev server, then either drop your own Outlook CSV export(s) onto the page
or click **Load sample data**.

## Data formats

Four Outlook formats are ingested (drop or pick any mix of files):

- **.pst** — Outlook Data File (`File → Open & Export → Import/Export → Export to a
  file → Outlook Data File`). Every folder is walked; carries **real timestamps**.
  Parsed lazily in the browser via `pst-extractor` (capped at 20k messages).
- **.csv** — Outlook CSV export (`… → Comma Separated Values`), UTF-8 with BOM.
  Expected columns include `Subject`, `Body`, `From/To/CC/BCC (Name)/(Address)/(Type)`,
  `Importance`, `Categories`. No date column exists in this format.
- **.msg** — individual messages dragged out of Outlook (CFB format, via
  `@kenjiuno/msgreader`). Carries real timestamps.
- **.eml** — RFC-822 messages (hand-rolled parser: folded headers, RFC 2047
  subjects, quoted-printable/base64, first text/plain part of multipart).
  Carries real timestamps.

Important notes about this format:

- **There is no date column.** The app never invents dates. When a reply body
  contains a quoted `Sent: <date>` header, it is surfaced as an *approximate*
  thread date, clearly marked as such.
- Bodies are multiline quoted CSV fields with `""` escaping — handled by PapaParse.
- Addresses are either SMTP emails or Exchange DNs
  (`/o=ExchangeLabs/.../cn=<hex>-josef.a.lar`). Identity is derived from the
  trailing DN segment (`josef.a.lar`) or the lowercased email.
- Multi-recipient To/CC fields are semicolon-separated in both the Name and
  Address columns and are aligned by index (defensively — counts can mismatch).
- Microsoft Teams auto-notifications are detected and tagged **low signal** so
  they don't pollute concept extraction.

## Architecture

```
src/
  lib/
    types.ts            Shared domain types (Message, GraphNode, Dataset, ...)
    parseOutlookCsv.ts  CSV -> Message[]  (BOM, recipient alignment, DN identity)
    analyze.ts          Message[] -> GraphData (persons, threads, concepts, SOPs, edges)
    dataset.ts          Versioned dataset schema, merge/dedupe, JSON export/import,
                        localStorage persistence (quota-guarded)
  components/
    App.tsx             State container, filtering, isolation, ingest flows
    GraphView.tsx       force-graph canvas: colors, sizing, labels, select/isolate
    Sidebar.tsx         Upload, search, type filter chips, layers, export/import
    DetailPanel.tsx     Slide-in inspector per node type
    UploadZone.tsx      Empty-state hero + additive drag-and-drop overlay
    StatsBar.tsx        Message/node/edge counts + loaded sources
tests/
  pipeline.test.ts      Runs parse + analyze on the real exports in data/
```

### Graph model

- **Person** — deduped by identity key; sized by degree; tracks sent/received counts.
- **Thread** — messages grouped by normalized subject (Re:/FW:/Fwd: stripped repeatedly).
- **Concept** — keyword/bigram extraction scored by frequency × thread spread, with
  stopwords plus domain boilerplate (Teams invites, signatures, URLs) removed.
- **SOP/Data** (diamonds) — regex detection of ASM message IDs (`GEN-26-AMAM-06`),
  `DSR`, `SOP`, and `vantage.army.mil` links.
- **Edges** — person→thread (participated), thread→concept (mentions),
  thread→SOP (references), person↔person co-occurrence (off by default, toggleable).

### Dataset schema (the expansion surface)

`{ schemaVersion: 1, generatedAt, sources, messages, graph }` — exported/imported
as JSON via the sidebar buttons. Additive CSV uploads merge in with content-hash
dedupe (subject+body+from) and a full re-analysis.

## Future versions

- Timeline view once a dated export format (PST/Graph API) is supported
- TF-IDF / embedding-based concept extraction and topic clustering
- Named-entity recognition for aircraft tail numbers, units, part numbers
- Thread sentiment / urgency scoring (Importance column is already captured)
- Saved views, pinned nodes, and manual node merging/renaming
- Community detection (Louvain) for org-structure discovery
- IndexedDB persistence for datasets beyond the localStorage quota
- Attachment manifest parsing and file-reference nodes

## Interaction cheatsheet

- Click node → select + highlight neighbors, open detail panel
- Double-click node → isolate its neighborhood (double-click again or click background to reset)
- Search → live-highlights matching nodes
- Chips → toggle node types; Layers → person–person co-occurrence edges
