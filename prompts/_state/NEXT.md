# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-06 (Cycle 2-F vorbereitet — letzter Cycle in Batch 2.)

---

## Context

**Batch 1** (retroactively named) ist abgeschlossen: Cycles 1-A through 1-E + 1-TH (Test Harness) + 1-FIX (Restore 400). Alles auf `develop` und `main` gemerged. 12 Backend-Tests grün.

**Batch 2** läuft. Cycles 2-A bis 2-E auf `develop` (2-A–2-C deployed auf `main`, 2-D + 2-E noch nicht gemerged). Sebastians Production-Review nach 2-D/2-E hat fünf + einen weiteren Fix ergeben → **Cycle 2-F** ist der letzte Cycle im Batch.

**Naming convention:** Batches nummeriert (1, 2, 3…). Cycles pro Batch alphabetisch (2-A, 2-B…). Sonder-Cycles: Kürzel-Prefix (2-FIX). Siehe DECISIONS 2026-05-05.

**Testing-Strategie (2026-05-02, hybrid Option D):** Jeder Cycle mit Backend-Touch bringt mind. 1 Test. Frontend-Tests out of scope. 12 Backend-Tests grün. Cycles 2-A–2-E waren reine Frontend-Cycles.

---

## 🟢 Nächster Schritt: Cycle 2-F ausführen

**Prompt:** `prompts/PROMPT_2-F_FINAL_POLISH.md`
**Notion:** https://www.notion.so/35724fe1d88a81ef8b63c4fe2ba5d07f
**Effort:** `xhigh`
**Review:** `review:recommended`

Sechs Fixes aus Sebastians Production-Review:
1. **Lagerplatz-Filter** auf Movements-Seite (kaskadierend: Lager → Lagerplatz → Bestandstyp, Referenz: Bestandsseite)
2. **Single-Line-Modus abschaffen** → immer Multi-Line + Filter, Einstiegspunkt steuert Vorauswahl
3. **Einzelne Variante highlighten** (auch bei nur einer Variante)
4. **X-Achse konsistenter** (immer Datum, Zeit nur bei Mehrfach-Einträgen am selben Tag)
5. **Scroll-Gradient auffälliger** (breiter, stärkere Opacity)
6. **Dashboard-Content Spacing** (mehr horizontales Padding auf allen Seiten, Tabellen nicht an den Rand gequetscht)

**Nach 2-F + Review:** Sebastian merged `develop → main`. Dann Batch 2 Production-Review (Checkliste für 2-D, 2-E, 2-F). Danach Batch 3 Planung.

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
