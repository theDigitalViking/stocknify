# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-06 (Batch 2 abgeschlossen — alle Cycles 2-A bis 2-E auf `develop`. Wartet auf Sebastians `develop` → `main` merge.)

---

## Context

**Batch 1** (retroactively named) ist abgeschlossen: Cycles 1-A through 1-E + 1-TH (Test Harness) + 1-FIX (Restore 400). Alles auf `develop` und `main` gemerged. 12 Backend-Tests grün.

**Batch 2** ist abgeschlossen: Cycles 2-A (UI Micro-Fixes), 2-B (Chart Polish + Date-Range), 2-B-FIX (Codex pass-2), 2-C (Movements von Produktseite + Multi-Line), 2-D (Production review fixes), 2-E (Filters + Legend Fade). Alles auf `develop`. Sebastian merged manuell auf `main` wenn der Vercel-Preview reviewed ist.

**Naming convention (neu):** Batches sind nummeriert (1, 2, 3…). Cycles innerhalb eines Batches starten bei A (2-A, 2-B, 2-C). Sonder-Cycles bekommen ein Kürzel-Prefix (z.B. 2-FIX). Siehe DECISIONS 2026-05-05.

**Testing-Strategie (2026-05-02, hybrid Option D):** Jeder Cycle mit Backend-Touch bringt mind. 1 Test. Frontend-Tests out of scope. 12 Backend-Tests grün (2 smoke + 2 upsert + 4 restore + 4 movements). Cycles 2-A–2-E waren reine Frontend-Cycles, daher kein neuer Test.

---

## 🟢 Nächster Schritt: Batch 2 abschließen

1. Sebastian reviewed Vercel Preview von `develop` (Movements-Filter + Legend-Fade live testen).
2. Sebastian merged `develop` → `main` (Production-Deploy-Gate, manuell).
3. Claude (Chat) plant Batch 3 nach dem Merge.

---

## 🟡 Review-Findings für spätere Batches

Aus Sebastians Review vom 2026-05-05. Items die nicht in Batch 2 aufgenommen wurden.

### Schema-Changes (M–L, Backend + Frontend)
7. **Movements-Quelle granularer** — "sync" aufschlüsseln in CSV-Import, SFTP, Integration, manuell. Braucht `sourceDetail`-Feld auf `stock_movements`.
10. **Lager + Lagerplatz Pflichtfeld-Kaskade** — Bestände brauchen immer Lager UND Lagerplatz. Default-Hierarchie: Import-Einstellung → Integrations-Default → Globaler Default (Settings-Page).
11. **CSV Duplikat-Handling** — drei Modi (aufsummieren, letzter Wert gewinnt, Fehler werfen), einstellbar pro Integration.
13. **Bestandswert-Feature** — Kostenfeld auf Variant/Movement-Ebene, Bewertungsmethode, dann echte Werte.

### Meta / Infra
9. **Performance/Smoothness** — Skeleton-Loader, schnellere Seitenübergänge, Ladeanimationen.
12. **Website + Help Center** — Feature-Dokumentation, öffentliche Seite.
14. **Öffentliche Roadmap** — auf der Website.

---

## 🟠 Backlog (bestehend, aus früheren Cycles)

- **Frontend test infra cycle** — React Testing Library setup for the Web app.
- **CI test-blocking flip** — after 5 cycles where the harness has been used, change CI to blocking.
- **Staging-System** — Sebastian führt ein Staging ein sobald erste Kunden live sind.
- **Idee #16 — Import-Undo.** Geparkt bis Sebastian die Verortung klärt.
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
