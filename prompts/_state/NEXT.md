# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-05 (Cycle E prompt written, ready for Claude Code — last cycle in batch A–E)

---

## Context

Stabilization-Track ist **abgeschlossen**, alle drei Cycles seit 2026-04-29 (Marketplace polish 2, Stock-overview navigation polish, CSV row-error sanitization broadened) sind auf `main` gemerged.

Frontend-Review hat 15 Bugs/Ideen + 1 geparkte Idee ergeben. Triage gebündelt zu fünf Cycles (A–E). **Cycle A ist abgeschlossen.** **Test-Harness Foundation ist abgeschlossen.** **Cycle B ist abgeschlossen** (commit `fc5036a`). **Cycle C ist abgeschlossen** (commits `c592907` + `c14eea2`). **Cycle D ist abgeschlossen** (2026-05-04).

**Testing-Strategie (2026-05-02, hybrid Option D):** Ab Cycle B gilt: jeder Cycle mit Backend-Touch bringt mind. 1 Test für das angefasste Endpoint-Surface mit. Frontend-Tests bleiben out of scope. Details: DECISIONS.md 2026-05-02.

---

## 🟢 Active cycle (prompt written, ready for Claude Code)

### Cycle E — Bestands-Verlauf + Chargen-Liste
- **Prompt:** `prompts/PROMPT_CYCLE_E_BESTANDS_VERLAUF_CHARGEN.md`
- **Notion:** https://www.notion.so/35724fe1d88a8151a53bf3bcc9ca9b13
- **Items:** R1 GET /stock/movements endpoint, R2 backend tests (empty state + filters + pagination + cross-tenant), R3 movements page with chart + table, R4 enable Activity icon on stock list, R5 Chargen-Liste on product detail, R6 i18n
- **Estimate:** L
- **Effort:** `xhigh` (default — new endpoint + chart + multi-component frontend feature)

---

## 🟡 Queued cycles

None — Cycle E is the last cycle in batch A–E. After it ships, Sebastian reviews `develop` and merges to `main`.

---

## 🟠 Backlog (post-Cycle-E)

- **Frontend test infra cycle** — React Testing Library setup for the Web app, prioritized to hooks (`useMarketplaceCatalog`, `useImportStock`, `useDeleteProducts`) over UI components. Decision deferred until backend test discipline has held for ≥3 cycles post-TH.
- **CI test-blocking flip** — after 5 cycles where the harness has been used, change CI from "tests are warnings" to "test failure = red CI". Tracked here as a future tightening; current default keeps the harness from blocking shipping during its bedding-in period.
- **Idee #16 — Import-Undo.** Kompletten CSV-Import (Produkt oder Bestand) rückgängig machen können. Verortung in der UI noch offen. Geparkt bis Sebastian die Verortung klärt.
- **CSV stock export** — Schema-Decision + Full-Stack-Cycle. 2–3 Cycles.
- **CSV i18n migration** — Move row-error reasons from English literals to translatable error codes.
- **CSV mapping editor: re-run delimiter detection after user override.**
- **Server-side sorting** (currently client-side; backend ignores `sortBy` / `sortDir`).
- **Bulk-select + bulk-delete für Stock page.**
- **Marketplace mutation toasts under masked-success transport failures.**
- **Marketplace integration rename after install.**
- **Identity-lock list-view completeness** — `hasExternalReferences` auf List-Endpoint.
- **Stock list `productId` deploy-skew defensive guard.**
- **CSV stock import: storage-location silent fallback.**
- **CSV stock import: dry-run "created" mismatch for batched rows.**
- **CSV stock import: `batchTracking=false` silently drops batch columns.**
