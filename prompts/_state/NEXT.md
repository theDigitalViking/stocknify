# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-05 (Batch A–E complete + Sebastian's review findings documented. One fix prompt pending, then new chat for next batch.)

---

## Context

Batch A–E ist **shipped und reviewed**. Alle fünf Cycles + Test-Harness Foundation sind auf `develop` und `main` gemerged. Sebastian hat eine manuelle Review durchgeführt (2026-05-05); Findings sind unten dokumentiert.

**Testing-Strategie (2026-05-02, hybrid Option D):** Jeder Cycle mit Backend-Touch bringt mind. 1 Test. Frontend-Tests out of scope. 12 Backend-Tests grün (2 smoke + 2 upsert + 4 restore + 4 movements).

---

## 🟢 Active cycle (prompt pending)

### Fix: Restore 400 Error
- **Bug:** `POST /products/:id/restore` gibt 400 statt Erfolg zurück (Frontend-Request-Problem oder Validierung)
- **Prompt:** wird in diesem Chat geschrieben
- **Estimate:** XS

---

## 🟡 Review-Findings für nächste Batch-Planung

Aus Sebastians Review vom 2026-05-05. Werden im neuen Chat priorisiert und zu Cycles gebündelt.

### Bugs
1. ~~**Restore 400 Error** — wird als Fix-Prompt in diesem Chat behandelt~~ → siehe Active cycle

### UX-Fixes (nächster Batch)
2. **Varianten-Selektion UX** — bei nur einer Variante nicht anklickbar machen. Bei mehreren: deutlicherer Highlight (stärkere Farbe oder zusätzliches Indikator-Element). Aktueller Highlight ist auf manchen Bildschirmen unsichtbar.
3. **Activity-Icon austauschen** — `Activity` (Heartbeat) → Chart/Diagramm-Icon (z.B. `BarChart3` oder `TrendingUp` aus lucide-react).
4. **Bestandswert-Spalte rausnehmen** — zeigt nur "—" weil kein Kostenfeld existiert. Verwirrt Nutzer. Wieder entfernen; als Zukunftsfeature mit Kostenfeld-Schema-Change zurückbringen.
5. **Movements-Chart: Uhrzeit anzeigen** — bei mehreren Einträgen am selben Tag muss die Zeitachse minutengenau sein, nicht nur Datum.
6. **Movements-Chart: Zeitraum-Auswahl** — Kalender-Picker (von–bis), nur Tage auswählbar an denen Daten existieren. Plus vorgefertigte Preset-Buttons: aktuelle Woche, letzte 14 Tage, aktueller Monat.
7. **Movements-Quelle granularer** — "sync" aufschlüsseln in CSV-Import, SFTP, Integration, manuell. Braucht `sourceDetail`-Feld auf `stock_movements` (Schema-Change).
8. **Movements von Produktseite erreichbar** — Link von Produkt-Detail → `/stock/movements?productId=xxx`. Zeigt alle Locations/StockTypes für dieses Produkt. Multi-Line-Chart (verschiedene Farben pro Location/StockType, togglebar). Vom Stock-List-Icon: vorselektiert auf eine Kombination. Von der Produktseite: Gesamtübersicht.
9. **Performance/Smoothness** — Ladeanimationen, Skeleton-Loader, schnellere Seitenübergänge. Seiten laden manchmal behäbig; beim Wechsel zwischen Produkten sieht man kurz alte Daten. Global als Optimierungs-Cycle oder pro Seite.

### Architektur / größere Features (Backlog)
10. **Lager + Lagerplatz Pflichtfeld-Kaskade** — Bestände brauchen immer Lager UND Lagerplatz. Default-Hierarchie: Import-Einstellung → Integrations-Default → Globaler Default (Settings-Page). Größeres Feature: Settings UI + Schema + Import-Flow-Anpassung.
11. **CSV Duplikat-Handling** (gleiche SKU + gleicher Lagerplatz in einer Datei) — drei Modi, einstellbar pro Integration (mit Global-Fallback): (a) Werte aufsummieren, (b) letzter Wert gewinnt, (c) Fehler werfen + Zeile ignorieren. Einstellung in Settings → Integration → Import.
12. **Website + Help Center** — alle Feature-Dokumentation so strukturieren, dass daraus später Docs/Help-Center gebaut werden kann. Separate Website mit öffentlicher Roadmap.
13. **Bestandswert-Feature (Zukunft)** — Kostenfeld auf Variant oder Movement-Ebene, Bewertungsmethode (Last Cost / Weighted Average / FIFO), dann Bestandswert-Spalte mit echten Werten.
14. **Öffentliche Roadmap** — auf der Website, damit Kunden sehen was als nächstes entwickelt wird.

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
