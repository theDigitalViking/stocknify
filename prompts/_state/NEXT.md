# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-04 (Cycle C prompt written, ready for Claude Code)

---

## Context

Stabilization-Track ist **abgeschlossen**, alle drei Cycles seit 2026-04-29 (Marketplace polish 2, Stock-overview navigation polish, CSV row-error sanitization broadened) sind auf `main` gemerged.

Frontend-Review hat 15 Bugs/Ideen + 1 geparkte Idee ergeben. Triage gebündelt zu fünf Cycles (A–E). **Cycle A ist abgeschlossen** (Marketplace install-name Bug war im Backend-Catalog-Endpoint). **Test-Harness Foundation ist abgeschlossen** (Vitest + Postgres-in-Docker, Smoke-Tests grün). **Cycle B ist abgeschlossen** (commit `fc5036a`, 2026-05-04 — `upsertStockLevel` extrahiert + identische-Menge schreibt jetzt eine `stock_movements`-Row mit `delta=0`, `ManualAdjustDialog` raus, Charge/MHD-Spalten gesplittet, Drei-Punkte-Menü zu einem Icon kollabiert, Bestandswert-Spalte als Platzhalter; erster Test unter dem TH-Harness).

**Testing-Strategie (2026-05-02, hybrid Option D):** Ab Cycle B gilt: jeder Cycle mit Backend-Touch bringt mind. 1 Test für das angefasste Endpoint-Surface mit. Frontend-Tests bleiben out of scope. Details: DECISIONS.md 2026-05-02.

---

## 🟢 Active cycle (prompt written, ready for Claude Code)

### Cycle C — Produkt-Detailseite Refactor
- **Prompt:** `prompts/PROMPT_CYCLE_C_PRODUKT_DETAIL_REFACTOR.md`
- **Notion:** https://www.notion.so/35624fe1d88a81138061fc38bb89d355
- **Items:** R0 fix CI test-harness migration path, R1 restructure header, R2 remove source icon from header, R3 Edit/Delete as labeled buttons, R4 source icon as variant-table column, R5 variant selection drives stock section
- **Estimate:** M
- **Effort:** `xhigh` (default — CI diagnosis + data-flow logic in R5 warrant full reasoning)

---

## 🟡 Queued cycles (next chat opens these in order)

### Cycle D — Produkte-Liste Polish + Soft-Delete Restore
- **Type:** Feature (Reaktivierung) + small UI
- **Items:**
  - **#2** Soft-deleted Produkte reaktivierbar machen. Backend: `POST /products/:id/restore` (oder PATCH mit `deletedAt: null`). Frontend: Toggle „inkl. gelöschte" oder eigener Tab + Reaktivieren-Button.
  - **#3** Detail-Icon (Eye) in der Aktionsspalte der Produkte-Liste.
  - **NEU: Backend test for `POST /products/:id/restore`.** New endpoint = mandatory test.
- **Estimate:** S–M

### Cycle E — Bestands-Verlauf + Chargen-Liste
- **Type:** Feature (größtes Stück, sauber als letztes)
- **Items:**
  - **#12** Bestands-Verlauf-Surface mit Chart + Bewegungstabelle. `GET /stock/movements` endpoint.
  - **#11** Chargen-Liste als eigener Block auf der Produkt-Detailseite.
  - **NEU: Backend tests for `GET /stock/movements`.**
- **Estimate:** L

---

## 🟠 Backlog (post-Cycle-E)

- **Frontend test infra cycle** — React Testing Library setup for the Web app, prioritized to hooks (`useMarketplaceCatalog`, `useImportStock`, `useDeleteProducts`) over UI components. Decision deferred until backend test discipline has held for ≥3 cycles post-TH.
- **CI test-blocking flip** — after 5 cycles where the harness has been used, change CI from "tests are warnings" to "test failure = red CI". Tracked here as a future tightening; current default keeps the harness from blocking shipping during its bedding-in period.
- **Idee #16 — Import-Undo.** Kompletten CSV-Import (Produkt oder Bestand) rückgängig machen können. Verortung in der UI noch offen — vermutlich auf der Detailseite eines Imports oder im Verlauf. Implementierung non-trivial: braucht eine `import_id` oder ähnliches als FK auf `stock_movements` / `products`, plus Rollback-Endpoint, plus Affordance in der UI. Geparkt bis Sebastian die Verortung klärt.
- **CSV stock export** — Schema-Decision (export-template flow distinct from import templates per DECISIONS 2026-04-18) + Full-Stack-Cycle. 2–3 Cycles.
- **CSV i18n migration** — Move row-error reasons from English literals to translatable error codes.
- **CSV mapping editor: re-run delimiter detection after user override.**
- **Server-side sorting** (currently client-side; backend ignores `sortBy` / `sortDir`).
- **Bulk-select + bulk-delete für Stock page.**
- **Marketplace mutation toasts under masked-success transport failures** — pre/post-state-diff layer (Codex 2026-04-29 round-2 deferral).
- **Marketplace integration rename after install** — PATCH constraint lift oder dedicated rename endpoint.
- **Identity-lock list-view completeness** — `hasExternalReferences` auf List-Endpoint.
- **Stock list `productId` deploy-skew defensive guard** (Codex 2026-04-30 deferral).
- **CSV stock import: storage-location silent fallback** (KNOWN_TODOS — narrow surface, MVP-tolerable).
- **CSV stock import: dry-run "created" mismatch for batched rows.**
- **CSV stock import: `batchTracking=false` silently drops batch columns.**
