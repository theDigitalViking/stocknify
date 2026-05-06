# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-06 (Cycle 2-F geliefert — Batch 2 vollständig auf `develop`, wartet auf Sebastians `develop → main` Merge)

---

## Context

**Batch 1** (retroactively named) ist abgeschlossen: Cycles 1-A through 1-E + 1-TH (Test Harness) + 1-FIX (Restore 400). Alles auf `develop` und `main` gemerged. 12 Backend-Tests grün.

**Batch 2** ist auf `develop` vollständig: Cycles 2-A bis 2-F. 2-A–2-C bereits auf `main` gemerged; 2-D, 2-E, 2-F warten auf Sebastians `develop → main` Merge.

**Naming convention:** Batches nummeriert (1, 2, 3…). Cycles pro Batch alphabetisch (2-A, 2-B…). Sonder-Cycles: Kürzel-Prefix (2-FIX). Siehe DECISIONS 2026-05-05.

**Testing-Strategie (2026-05-02, hybrid Option D):** Jeder Cycle mit Backend-Touch bringt mind. 1 Test. Frontend-Tests out of scope. 12 Backend-Tests grün. Cycles 2-A–2-F waren reine Frontend-Cycles.

---

## 🟢 Nächster Schritt

1. **Codex review für 2-F** (`review:recommended`). Sebastian läuft `/codex:adversarial-review --base origin/main` in dieser Session. Findings werden direkt in der Session bearbeitet (Fixes commit-en, REVIEW-Datei schreiben, push).
2. **Sebastian merged `develop → main`.** `git checkout main && git merge develop --ff-only && git push`. Triggert Vercel-Production für 2-D + 2-E + 2-F sowie alle Codex-Review-Fixes seit 2-C.
3. **Batch-2-Production-Review** durch Sebastian: Checkliste in der Plannung-Chat-Session abarbeiten (sticky header, sticky breadcrumb, Lager+Lagerplatz+Bestandstyp Filter, single-line removal, X-Achse Date+Time, Variantenmarkierung bei Single-Variant-Produkten, Scroll-Indicator, Content-Padding).
4. **Batch 3 Planung** in der Chat-Session.

---

## 🟡 Review-Findings für spätere Batches

Aus Sebastians Reviews vom 2026-05-05 + 2026-05-06. Items die nicht in Batch 2 aufgenommen wurden.

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
- **`StockMovementChart.selectedRangeMs` prop deprecated** — kept on the discriminated union for backwards-compat after Cycle 2-F's tick-formatter rewrite. Remove together with the now-dead `ONE_DAY_MS`/`SEVEN_DAYS_MS` thinking when convenient.
