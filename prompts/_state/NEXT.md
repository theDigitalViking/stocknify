# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-22 (Cycle 5-A.5 ✅ done — Integration ist Konfig-Anker, Edit-Page restructured, SFTP/FTP/FTPS rename gate offen. Backend-Tests 95 → 109. Nächster Cycle 5-B Schedule Builder Rebuild profitiert vom schlankeren Schedule-Body.)

---

## Context

**Batch 1–4** abgeschlossen. **Batch 5** in Arbeit.

**Batch 5 — SFTP Polish + Funktionstest.** Sebastian hat am 2026-05-13 alle bisherigen Findings konsolidiert (S1–S10 aus dem Batch-3-Production-Review) und durch eine detaillierte Walk-Through-Session 17 weitere Findings hinzugefügt (S12–S27). S9 bereits in 4-E gefixt, S18 als zu komplex für MVP verworfen. **Wichtige Architektur-Entscheidung in 5-A.5:** Credential + Mapping wandern aus `IntegrationSchedule` auf `Integration` als persistente Defaults — Schedules werden zu reinen Zeit-Plänen.

**Backend-Tests:** 109 grün (Stand Cycle 5-A.5).

---

## 🟢 Batch 5 — Cycle-Plan

### Phase 1 — Pre-Test (testbar machen)

| Cycle | Findings | Größe | Review | Status |
|-------|----------|-------|--------|--------|
| **5-A** | S1 (Ghost Integration), S2 (Delete-Button), S27 (Card-Konsistenz) | M | skip | ✅ Done |
| **5-A.5** | Schema-Refactor: Credential+Mapping auf Integration verschieben + Name inline-edit + Section-Local-Saves auf Edit-Page | M–L | mandatory | ✅ Done 2026-05-22 |
| **5-B** | S15, S16, S17 (optional), S20, S25 — Schedule Builder Rebuild (profitiert von schlankerem Schedule-Modell) | M | recommended | next |
| **5-C** | S22 — File-Handling delete/archive (passt thematisch zu 5-A.5 — beides "Konfig auf Integration") | M | mandatory | pending |

### Phase 2 — Test

| Cycle | Findings | Größe | Status |
|-------|----------|-------|--------|
| **5-D** | S11 — SFTP End-to-End-Test mit echtem Server | manuell | pending |

### Phase 3 — Post-Test Polish

| Cycle | Findings | Größe | Review | Status |
|-------|----------|-------|--------|--------|
| **5-E** | S12 (Wizard Step 2 leer), S13 (Click-Through-Browser Wizard + Edit), S24 (Click-Through Config Remote-Section), **plus `Integration.importPath` Schema** | M–L | mandatory | pending |
| **5-F** | S14 (Template-Link bricht Wizard ab), S19 (Mapping-UUID statt Name), S21 (Step-Sprung-Navigation) | S–M | skip | pending |
| **5-G** | S3/S23 (Breadcrumbs), S4 (Health-Info bei neuer Integration), S5 (Header-Layout SFTP/Toggle), S6 (Marketplace Badge-Position), S7 (Modal schließen nach Install), S10 (Marketplace Edit-Möglichkeit — falls nicht durch S27 abgedeckt), S26 ("Jetzt importieren" Primary Action) | M | skip | pending |

---

## 📋 Finding-Status (Batch 5)

### Bugs (HIGH)
- ~~**S1**~~ — Geister-Integration → ✅ 5-A
- ~~**S2**~~ — SFTP nicht löschbar → ✅ 5-A

### UX/Visual (MEDIUM, aus Batch-3-Review)
- **S3** — Breadcrumb-Style auf Config-Seite → 5-G (Duplikat S23)
- **S4** — Health-Info bei neuer Integration unsinnig → 5-G
- **S5** — Header-Layout Config-Seite ("Unerkennbar" + Toggle-Position) → 5-G
- **S6** — Marketplace Install-Count-Badge Position → 5-G
- **S7** — Marketplace Katalog schließen nach Installation → 5-G
- **S8** — Wizard Step 2 Directory-Browser → 5-E (präzisiert durch S12+S13)
- ~~S9~~ — Movements-Filter → ✅ 4-E
- **S10** — Marketplace-Integrationen brauchen Edit-Möglichkeit → 5-G

### Wizard (aus Triage 2026-05-13)
- **S12** — Wizard Step 2 leer → 5-E
- **S13** — Click-Through-Verzeichnisbrowser → 5-E
- **S14** — "Template verwalten"-Link bricht Wizard ab → 5-F
- **S15** — Zeitplan-Presets kaputt → 5-B
- **S16** — Zeitplan-Presets müssen Typ mitziehen → 5-B
- **S17** — Täglich-Schedule mehrere Uhrzeiten → 5-B (optional, ggf. raus)
- ~~S18~~ — Wöchentlich + Multi-Time → **out** (MVP-Entscheidung)
- **S19** — Step 5 Mapping als UUID → 5-F
- **S20** — Step 5 Zeitplan englisch → 5-B
- **S21** — Wizard-Navigation Step-Sprung → 5-F

### Neue Features
- **S22** — Post-Import Datei-Handling → 5-C

### Config-Seite (aus Triage 2026-05-13)
- **S23** — Breadcrumbs Config-Seite → 5-G (Duplikat S3)
- **S24** — Remote-Verzeichnis Click-Through → 5-E
- **S25** — Zeitplan-Section erbt Wizard-Issues → 5-B
- **S26** — "Jetzt importieren" Primary Action im Header → 5-G

### Konsistenz (aus Triage 2026-05-13)
- ~~**S27**~~ — Drei-Punkte-Menü auf SFTP-Card → ✅ 5-A

### Funktionstest
- **S11** — SFTP End-to-End-Test → 5-D

---

## 🔑 Design-Entscheidungen Batch 5 (live)

**5-A.5 — Konfig-Anker:**
- `Integration.credentialId` + `Integration.csvMappingTemplateId` als nullable FK-Felder
- `IntegrationSchedule.credentialId` wird nullable (Override-Semantik bleibt für Schema, UI zeigt es nicht)
- Migration: Backfill von Schedule → Integration für bestehende Daten
- DELETE Credential blockt sowohl bei Schedule- als auch bei Integration-Referenz (409)
- Worker liest Integration als Primary Source, Schedule als optionaler Override
- Manual-Import + Schedule-Create: credentialId-Body-Field wird optional, Fallback auf Integration

**5-A.5 — Edit-Page UX:**
- Name im Header: inline-edit mit Pencil-Icon
- PATCH erlaubt `name` für SFTP/FTP/FTPS-Marketplace-Keys (Narrowing der bestehenden Immutability)
- Credential + Mapping als eigene Sektionen mit Auto-Save bei Auswahlwechsel
- Schedule-Section schrumpft auf Zeit-Felder; Save bleibt atomic
- Schedule-Create gated wenn Integration.credentialId == null

**Aus früherer Planung (gültig):**

**File-Handling (5-C):**
- `postImportAction: 'delete' | 'archive'` (Default: `'archive'`)
- `archivePath: string?` (Default: `<remotePath>/archive/<YYYY-MM>/`)
- Felder auf `Integration` (passt jetzt thematisch zu 5-A.5)

**Directory-Path (5-E):**
- `Integration.importPath` als Sub-Verzeichnis pro Integration (unter Credential.remotePath)
- Click-Through-Browser im Wizard + Edit-Page

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

- **Schedule-level Credential/Mapping-Override UI** (nach 5-A.5) — Schema unterstützt es, UI zeigt nur Integration-Ebene; falls jemals Power-User-Use-Case auftaucht
- **Marketplace rename für non-SFTP** — narrowing in 5-A.5 ließ Shopify/Hive/Byrd-Rename offen
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
- **Identity-lock list-view completeness**
- **Stock list `productId` deploy-skew defensive guard**
- **CSV stock import: storage-location silent fallback**
- **CSV stock import: dry-run "created" mismatch**
- **CSV stock import: `batchTracking=false` silently drops batch columns**
- **`StockMovementChart.selectedRangeMs` prop deprecated**
- **Marketplace `singleton` flag** — per-entry single-install enforcement
- **Deprecated bulk uninstall endpoint** — remove `DELETE /marketplace/:key/uninstall`
- **Dedicated SFTP install endpoint** — replace indirect `INTERNAL_INTEGRATIONS` path
