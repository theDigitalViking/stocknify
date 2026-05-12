# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-13 (Batch 5 geplant. Sebastian-Triage hat 17 zusätzliche Findings produziert; Cycle 5-A schreibt gerade Ghost Integration Fix + Delete-Konsistenz.)

---

## Context

**Batch 1–4** abgeschlossen. Batch 5 ist gestartet.

**Batch 5 — SFTP Polish + Funktionstest.** Sebastian hat am 2026-05-13 alle bisherigen Findings konsolidiert (S1–S10 aus dem Batch-3-Production-Review) und durch eine detaillierte Walk-Through-Session 17 weitere Findings hinzugefügt (S12–S27, plus S22 als File-Handling-Feature). S9 bereits in 4-E gefixt; S18 als zu komplex für MVP verworfen.

**Backend-Tests:** 95 grün (Stand Cycle 4-E).

---

## 🟢 Batch 5 — Cycle-Plan

### Phase 1 — Pre-Test (testbar machen)

| Cycle | Findings | Größe | Review | Status |
|-------|----------|-------|--------|--------|
| **5-A** | S1 (Ghost Integration), S2 (Delete-Button fehlt), S27 (Card-Konsistenz mit Marketplace) | M | skip | 🚧 In Arbeit — `PROMPT_5-A_GHOST_INTEGRATION_DELETE.md` |
| **5-A.5** | Section-Local-Saves auf Edit-Seite | S–M | skip | pending |
| **5-B** | S15, S16, S17, S20, S25 — Schedule Builder Rebuild + i18n | M | recommended | pending |
| **5-C** | S22 — File-Handling delete/archive (Backend + Schema + Frontend) | M | mandatory | pending |

### Phase 2 — Test

| Cycle | Findings | Größe | Status |
|-------|----------|-------|--------|
| **5-D** | S11 — SFTP End-to-End-Test mit echtem Server | manuell | pending |

### Phase 3 — Post-Test Polish

| Cycle | Findings | Größe | Review | Status |
|-------|----------|-------|--------|--------|
| **5-E** | S12 (Wizard Step 2 leer), S13 (Click-Through-Browser Wizard + Edit), S24 (Click-Through Config Remote-Section) | M–L | mandatory/recommended | pending |
| **5-F** | S14 (Template-Link bricht Wizard ab), S19 (Mapping-UUID statt Name), S21 (Step-Sprung-Navigation) | S–M | skip | pending |
| **5-G** | S3/S23 (Breadcrumbs), S4 (Health-Info bei neuer Integration), S5 (Header-Layout SFTP/Toggle), S6 (Marketplace Badge-Position), S7 (Modal schließen nach Install), S10 (Marketplace Edit-Möglichkeit — falls nicht durch S27 abgedeckt), S26 ("Jetzt importieren" Primary Action) | M | skip | pending |

---

## 📋 Finding-Liste (Batch 5)

### Bugs (HIGH)
- **S1** — Geister-Integration bei "Direkte Konfiguration": sofortiger API-Call statt zwei-Schritt-Flow → 5-A
- **S2** — SFTP-Integrationen nicht löschbar (Card + Edit-Seite) → 5-A

### UX/Visual (MEDIUM, aus Batch-3-Review)
- **S3** — Breadcrumb-Style auf Config-Seite → 5-G (Duplikat S23)
- **S4** — Health-Info bei neuer Integration unsinnig → 5-G
- **S5** — Header-Layout Config-Seite ("Unerkennbar" + Toggle-Position) → 5-G
- **S6** — Marketplace Install-Count-Badge Position → 5-G
- **S7** — Marketplace Katalog schließen nach Installation → 5-G
- **S8** — Wizard Step 2 Directory-Browser fehlt → 5-E (präzisiert durch S12+S13)
- ~~S9~~ — Movements-Filter wirken nur auf Chart → ✅ gefixt in 4-E
- **S10** — Marketplace-Integrationen brauchen Edit-Möglichkeit → 5-G (teilweise abgedeckt durch S27)

### Wizard (aus Triage 2026-05-13)
- **S12** — Wizard Step 2 "Verzeichnis" leer; Browser erst nach Anlage → 5-E
- **S13** — Click-Through-Verzeichnisbrowser (Wizard + Edit-Seite) → 5-E
- **S14** — "Template verwalten"-Link bricht Wizard ab, State geht verloren → 5-F
- **S15** — Zeitplan-Presets kaputt (kein Typ-Sync zwischen Preset und Selector) → 5-B
- **S16** — Zeitplan-Presets müssen Typ mitziehen (wenn Presets bleiben) → 5-B
- **S17** — Täglich-Schedule: mehrere Uhrzeiten via +-Button → 5-B
- ~~S18~~ — Wöchentlich + Multi-Time pro Tag → **out** (zu viel für MVP, Sebastian-Entscheidung)
- **S19** — Step 5 (Zusammenfassung) zeigt Mapping als UUID statt Name → 5-F
- **S20** — Step 5 Zeitplan-Text auf Englisch ("weekly on days one and at") statt übersetzt → 5-B
- **S21** — Wizard-Navigation: Sprung zu beliebigem Step ohne Datenverlust → 5-F

### Neue Features
- **S22** — Post-Import Datei-Handling: pro Integration konfigurierbar (löschen oder archivieren in `<remotePath>/archive/<YYYY-MM>/`, Default = archivieren) → 5-C

### Config-Seite (aus Triage 2026-05-13)
- **S23** — Breadcrumbs Config-Seite (Duplikat S3) → 5-G
- **S24** — Remote-Verzeichnis-Tabelle: kein Click-Through → 5-E
- **S25** — Zeitplan-Section erbt alle Wizard-Issues → 5-B (gemeinsame Component)
- **S26** — "Jetzt importieren" Primary Action im Header (analog `/products` Add-Button) → 5-G

### Konsistenz (aus Triage 2026-05-13)
- **S27** — Drei-Punkte-Menü auf SFTP-Card analog Marketplace (Bearbeiten + Löschen) + Löschen auf Edit-Seite → 5-A

### Funktionstest
- **S11** — SFTP End-to-End-Test mit echtem Server → 5-D

---

## 🔑 Design-Entscheidungen Batch 5

**Save-Pattern auf Edit-Seite (für 5-A.5):**
Hybrid — section-local saves statt globaler Speichern-Button. Details:
- Name (Header) → inline-edit, blur-save oder Pencil-Icon
- Toggle → direkt
- Zugangsdaten → Auto-Save bei Auswahlwechsel
- Verzeichnis → "Speichern"-Button bei Dirty-State
- Mapping → Auto-Save bei Auswahlwechsel
- Zeitplan → "Zeitplan speichern"-Button (atomic, da Sub-Form mit invaliden Zwischenzuständen)
- File-Handling → Dropdown-Auto-Save, "Pfad speichern"-Button für Custom-Path

**Create-Page (für 5-A):**
Bewusst minimal — nur Name-Modal (analog `MarketplaceInstallDialog`). User landet auf der Edit-Seite und konfiguriert dort weiter. Volle Create-Page mit allen Sektionen kommt erst wenn der Edit-Modus mit Section-Local-Saves stabil läuft (5-A.5+).

**File-Handling Schema (für 5-C):**
- `postImportAction: 'delete' | 'archive'` (Default: `'archive'`)
- `archivePath: string?` (Default: `<remotePath>/archive/<YYYY-MM>/`)
- Felder auf `Integration` (nicht `IntegrationSchedule`) — gilt für alle Schedules der Integration, auch manuelle Imports

---

## 🟠 Review-Findings für spätere Batches

### Schema-Changes (M–L, Backend + Frontend)
- ~~**Movements-Quelle granularer**~~ — teilweise in Cycle 3-C adressiert
- **Lager + Lagerplatz Pflichtfeld-Kaskade** — Default-Hierarchie
- **CSV Duplikat-Handling** — drei Modi
- **Bestandswert-Feature** — Kostenfeld

### Meta / Infra
- **Performance/Smoothness** — Skeleton-Loader, schnellere Seitenübergänge
- **Website + Help Center** — Feature-Dokumentation
- **Öffentliche Roadmap** — auf der Website

---

## 🟠 Backlog (bestehend)

- **Frontend test infra cycle** — React Testing Library setup
- **CI test-blocking flip** — change CI to blocking
- **Staging-System** — sobald erste Kunden live
- **Idee #16 — Import-Undo**
- **CSV stock export** — 2–3 Cycles
- **CSV i18n migration** — translatable error codes
- **CSV mapping editor: re-run delimiter detection after user override**
- **Server-side sorting**
- **Bulk-select + bulk-delete für Stock page**
- **Marketplace mutation toasts under masked-success transport failures**
- **Marketplace integration rename after install**
- **Identity-lock list-view completeness**
- **Stock list `productId` deploy-skew defensive guard**
- **CSV stock import: storage-location silent fallback**
- **CSV stock import: dry-run "created" mismatch**
- **CSV stock import: `batchTracking=false` silently drops batch columns**
- **`StockMovementChart.selectedRangeMs` prop deprecated**
- **Marketplace `singleton` flag** — per-entry single-install enforcement
- **Deprecated bulk uninstall endpoint** — remove `DELETE /marketplace/:key/uninstall`
- **Dedicated SFTP install endpoint** — replace indirect `INTERNAL_INTEGRATIONS` path
