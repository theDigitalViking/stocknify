# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-12 (Batch 3 auf `main` deployed. Production-Review-Findings dokumentiert. Batch 4 Planung steht an.)

---

## Context

**Batch 1** abgeschlossen. Auf `main`.

**Batch 2** abgeschlossen. Auf `main`.

**Batch 3** abgeschlossen + deployed. Cycles 3-A bis 3-E. 61 Backend-Tests grün. Deployment-Fix: `prisma migrate deploy` in CI/CD eingebaut + Prisma-Baselining auf Production. Redis (Upstash) Secret in GitHub Actions hinterlegt.

**Infra-Fixes während Batch-3-Deploy:**
- `deploy.yml`: `prisma migrate deploy --schema src/db/schema.prisma` läuft jetzt vor manuellen SQL-Migrations.
- Prisma-Baselining: 5 bestehende Migrations als `applied` markiert. Zukünftige Migrations laufen automatisch.

---

## 🟢 Nächster Schritt: Batch 4 — SFTP/FTP UI Polish + Marketplace-Fix

Aus Sebastians Production-Review von Batch 3. Priorisiert nach Schwere:

### Kritisch (Bugs)

**F1 — Marketplace-Kontamination (HIGH)**
Installierte Integrations-Instanzen (z.B. "Shopify Test", "Privat Available") überschreiben die statischen Marketplace-Katalog-Einträge. Marketplace soll NUR den statischen Katalog zeigen. Installierte Instanzen zeigen einen Installations-Zähler ("2x installiert"), nicht den Instanz-Namen. SFTP-Integrationen dürfen NICHT im Marketplace unter "ERP-Systeme" erscheinen — SFTP hat seinen eigenen Bereich unter `/integrations/automatic`.

**F2 — Marketplace Multi-Install blockiert (HIGH)**
Alle Marketplace-Integrationen (Shopify, WooCommerce, Xentral, Hive, etc.) müssen mehrfach installierbar sein — ein Merchant kann mehrere Shops/Systeme desselben Typs anbinden. "Install"-Button soll immer sichtbar bleiben, mit Zähler der bestehenden Installationen.

**F3 — Movements-Filter zeigen immer noch "Alle" + unvollständige Optionen (MEDIUM)**
Cycle 3-A sollte das fixen, aber das Verhalten ist auf Production weiterhin falsch:
- Dropdowns zeigen nur die Optionen des angeklickten Bestandseintrags, nicht ALLE verfügbaren Lager/Lagerplätze/Typen.
- Alle Optionen müssen sichtbar sein; die relevanten vorausgewählt.
- Labels zeigen "Alle" statt konkreter Auswahl.

### UX-Verbesserungen

**F4 — "Integration hinzufügen"-Button Position (SMALL)**
Button sitzt im Header statt unterhalb der Header-Leiste. Inkonsistent mit anderen Seiten (z.B. Marketplace).

**F5 — Wizard vs. Direktkonfiguration Auswahl (MEDIUM)**
Beim Klick auf "Integration hinzufügen" soll der User wählen können: Wizard (geführt) ODER leere Config-Seite (direkt). Config-Seite = gleiche Felder wie Edit-Seite, nur leer + Pflichtfelder markiert.

### Deferred (nicht in Batch 4)

- SFTP-Funktionalitätstest mit echtem Server (Credentials, Directory, Import, Schedule) — nach UI-Fixes
- Stock-Types i18n (Available/Reserved) — erst nach erstem Kundenfeedback

---

## 🟡 Review-Findings für spätere Batches

### Schema-Changes (M–L, Backend + Frontend)
7. ~~**Movements-Quelle granularer**~~ — teilweise in Cycle 3-C adressiert (`source: 'sftp'`/'ftp'`). Vollständiges `sourceDetail`-Feld für spätere Batches.
10. **Lager + Lagerplatz Pflichtfeld-Kaskade** — Default-Hierarchie: Import-Einstellung → Integrations-Default → Globaler Default.
11. **CSV Duplikat-Handling** — drei Modi, einstellbar pro Integration.
13. **Bestandswert-Feature** — Kostenfeld auf Variant/Movement-Ebene, Bewertungsmethode.

### Meta / Infra
9. **Performance/Smoothness** — Skeleton-Loader, schnellere Seitenübergänge.
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
- **`StockMovementChart.selectedRangeMs` prop deprecated** — remove with dead `ONE_DAY_MS`/`SEVEN_DAYS_MS` when chart is touched next.
