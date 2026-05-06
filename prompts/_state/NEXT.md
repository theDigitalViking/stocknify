# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-08 (Cycle 3-C abgeschlossen — SFTP/FTP connector + import_runs + manual import live; nächster Cycle ist 3-D BullMQ schedule engine)

---

## Context

**Batch 1** abgeschlossen. Cycles 1-A through 1-E + 1-TH + 1-FIX. Auf `main`. 12 Backend-Tests grün.

**Batch 2** abgeschlossen. Cycles 2-A bis 2-F + alle Codex-Review-Fixes. Auf `main` (merged 2026-05-07). 13 Backend-Tests grün.

**Batch 3** in Arbeit — SFTP/FTP Automated Import. 5 Cycles (3-A bis 3-E). Schema für `integration_credentials` und `integration_schedules` existiert bereits (Prisma v3); Cycle 3-C hat zusätzlich `import_runs` angelegt. **3-A** (UX Polish), **3-B** (Credential Vault) und **3-C** (SFTP/FTP Connector + Import Pipeline) sind abgeschlossen. Verbleibend: **3-D** (BullMQ Schedule Engine), **3-E** (Frontend Config + Wizard).

**Naming convention:** Batches nummeriert (1, 2, 3…). Cycles pro Batch alphabetisch. Sonder-Cycles: Kürzel-Prefix.

**Testing-Strategie:** Jeder Cycle mit Backend-Touch bringt mind. 1 Test. 13 Backend-Tests grün. Batch-3-Cycles 3-B, 3-C, 3-D haben Backend-Touch → Tests mandatory.

---

## 🟢 Batch 3 — SFTP/FTP Automated Import

### Bereits im Schema vorhanden (kein neuer Tabellen-Bau nötig):
- **`integration_credentials`** — `credentialType` (sftp/ftp/api_key/oauth…), `host`, `port`, `username`, `password`, `token`, `secret`, `remotePath`, `additionalAttributes`, `isActive`, `lastVerifiedAt`. Encryption-Pattern mit `CREDENTIALS_ENCRYPTION_KEY` established.
- **`integration_schedules`** — `scheduleType` (interval_minutes/interval_hours/daily/weekly), `intervalValue`, `timeOfDay`, `weekdays[]`, berechnete `cronExpression`. FK zu `csvMappingTemplateId` + `credentialId`. Check-Constraints in `schedule-check-constraints.sql`.
- **`incidents`** — für Fehler-Logging bei fehlgeschlagenen Imports.

### Noch nötig:
- Schema-Tweak: `integrationId` auf `integration_credentials` nullable machen (Credential-Reusability).
- Neue `import_runs`-Tabelle (Import-Historie pro Integration).
- Alle CRUD-Endpoints (Credentials, Schedules, Files, Import-Trigger).
- BullMQ + Redis (Upstash) Infrastruktur auf Hetzner.
- SFTP/FTP-Client-Libraries + Pipeline-Wiring.
- Frontend: Config-Seite + Wizard.

---

### Cycle 3-A — UX Polish (XS, Frontend-only)
**Review:** `review:skip`
**Effort:** `high`

Items 15–18 aus Sebastians Production-Review:
1. Varianten-Highlight Farbe — grün-auf-grün ersetzen (stärkerer Kontrast / anderer Farbkanal)
2. Movements-Filter Labels — bei Einzelauswahl konkreten Wert anzeigen statt "Alle"
3. Lagerplatz-Spalte in Movements-Tabelle ergänzen
4. Plan-Badge in Sidebar vertikal zentriert als zusammengehöriger Block

### Cycle 3-B — Credential Vault Backend (S–M, Backend)
**Review:** `review:mandatory`
**Effort:** `xhigh`

Schema existiert (`integration_credentials`). Dieser Cycle baut die Endpoints + Encryption-Layer:
- **Migration:** `integrationId` nullable machen auf `integration_credentials` (ermöglicht tenant-scoped Credentials ohne Integration-Bindung → Wiederverwendung).
- **Encryption-Utils:** `encrypt`/`decrypt`-Helpers für `password`, `token`, `secret`, `additionalAttributes` mit bestehendem `CREDENTIALS_ENCRYPTION_KEY` (AES-256-GCM). Felder werden vor dem Speichern verschlüsselt, beim Lesen entschlüsselt. API gibt sensible Felder nie im Klartext zurück (Masking: `"pass****"`).
- **CRUD-Endpoints:** `GET /v1/credentials` (Liste mit Nutzungszähler — wie viele Schedules referenzieren), `POST /v1/credentials`, `PATCH /v1/credentials/:id`, `DELETE /v1/credentials/:id` (Soft-Delete; Reject wenn aktive Schedules referenzieren).
- **Connection-Test:** `POST /v1/credentials/:id/test` — baut echte SFTP/FTP-Verbindung auf, gibt `{ success: true, serverBanner?: string }` oder `{ success: false, error: string }` zurück. Nutzt `ssh2-sftp-client` (SFTP) / `basic-ftp` (FTP/FTPS) — Libraries werden hier installiert, Connector-Code in 3-C.
- **Tests:** CRUD happy path, credential masking assertion, connection test mock, cross-tenant RLS isolation.

### Cycle 3-C — SFTP/FTP Connector + Import Pipeline (M, Backend)
**Review:** `review:mandatory`
**Effort:** `xhigh`

- **Connector-Implementierung:** `apps/api/src/integrations/sftp/` + `apps/api/src/integrations/ftp/`. Shared Interface: `connect(credential)`, `listDirectory(path, filter?)`, `streamFile(path)`, `disconnect()`. SFTP via `ssh2-sftp-client`, FTP/FTPS via `basic-ftp`.
- **Directory-Listing-Endpoint:** `GET /v1/integrations/:id/files?credentialId=...&path=...` — listet Dateien im Verzeichnis (Name, Größe, letztes Änderungsdatum), gefiltert auf `.csv`.
- **Manueller Import-Trigger:** `POST /v1/integrations/:id/import-now` mit Body `{ credentialId, filePath?, mappingTemplateId? }`. Streamt Remote-CSV direkt in bestehende Pipeline (`iconv.decodeStream` → `parseCsvStreaming` → Mapping → `upsertStockLevel`). Kein Temp-File (DECISIONS 2026-05-07). Ergebnis wird als `import_run` geloggt.
- **Neue `import_runs`-Tabelle:** `id`, `tenant_id`, `integration_id`, `schedule_id?`, `credential_id`, `trigger` (manual/scheduled), `status` (running/success/partial/failed), `file_name`, `file_size_bytes`, `rows_total`, `rows_created`, `rows_updated`, `rows_skipped`, `rows_errored`, `error_summary`, `started_at`, `completed_at`. Plan-tiered Retention (DECISIONS 2026-05-07).
- **Import-History-Endpoint:** `GET /v1/integrations/:id/runs` (paginiert, plan-tiered).
- **Source-Differenzierung:** `source: 'sftp'` oder `source: 'ftp'` auf `stock_movements` statt generischem `'sync'` (greift Item 7 aus den Review-Findings teilweise auf).
- **Tests:** Directory listing mock, import-run creation + status transitions, stream-pipeline unit test mit mock SFTP, cross-tenant isolation.

### Cycle 3-D — Schedule Engine (M, Backend)
**Review:** `review:mandatory`
**Effort:** `xhigh`

Schema existiert (`integration_schedules` mit User-Feldern + Cron). Dieser Cycle baut die Job-Infrastruktur:
- **BullMQ + Upstash Redis:** Connection-Setup, Queue-Definition (`sftp-import-queue`), Worker-Bootstrap beim API-Start. Redis-URL aus `REDIS_URL` env (Upstash, bereits in PROJECT.md vorgesehen).
- **Schedule-CRUD:** `GET/POST/PATCH/DELETE /v1/integrations/:id/schedules`. Server berechnet `cronExpression` aus den User-Feldern (`scheduleType`, `intervalValue`, `timeOfDay`, `weekdays`) — Client sendet nie eine Cron-Expression direkt. Validation mit `cron-parser`. `nextRunAt` wird bei Create/Update berechnet.
- **Repeatable-Job-Management:** Bei Schedule-Create → BullMQ `add(name, data, { repeat: { cron, tz } })`. Bei Update → altes Repeatable entfernen, neues registrieren. Bei Delete/Deactivate → Repeatable entfernen.
- **Worker:** `apps/api/src/jobs/sftp-import.worker.ts` — lädt Schedule + Credential + Integration-Config, verbindet via Connector (3-C), streamt neueste CSV (oder konfigurierte Datei), schreibt `import_runs`-Eintrag, aktualisiert `lastRunAt/Status/Error` auf Schedule + `healthStatus`/`consecutiveFailures` auf Integration.
- **Retry:** 3 Retries mit exponentiellem Backoff bei Connection-Fehlern. Nach 3 Failures → `import_run` mit `status: 'failed'`, Incident erstellen (nutzt bestehende `incidents`-Tabelle), nächster Cron-Run läuft normal.
- **Tests:** Schedule CRUD + cron computation, worker job creation mock, retry-after-failure assertion.

### Cycle 3-E — Integration UI: Config-Seite + Wizard (L, Frontend)
**Review:** `review:recommended`
**Effort:** `xhigh`

Beide UI-Modi in einem Cycle, weil sie dieselben Komponenten nutzen:

**Shared Components:**
- `CredentialSelector` — Dropdown bestehender Credentials + "Neu anlegen" Inline-Form. Connection-Test-Button mit Echtzeit-Feedback (Spinner → Haken/Fehler).
- `DirectoryBrowser` — ruft Backend-Listing auf, zeigt CSV-Dateien als Liste (Name, Größe, Datum). Pfad editierbar.
- `MappingTemplateSelector` — Dropdown bestehender Templates + Hinweis "Kein Mapping = Default-Spalten".
- `ScheduleBuilder` — Mehrstufig: (1) Typ wählen (Intervall / Täglich / Wöchentlich), (2) Details je nach Typ. Zeigt lesbaren Satz ("Jeden Montag und Mittwoch um 17:00 Uhr"). Timezone-Auswahl.
- `ImportRunsTable` — letzte Runs (Datum, Datei, Status-Badge, Zeilen-Stats, Dauer). "Jetzt importieren"-Button.

**Config-Seite** (Route `/integrations/:id/configure`):
- Alle Shared Components auf einer Seite. Für erfahrene User die alles auf einen Blick sehen wollen.
- Health-Indikator (letzter erfolgreicher Sync, consecutive failures).
- Direkt erreichbar über Marketplace-Karte → "Konfigurieren".

**Wizard** (Modal oder eigene Route):
- Schritt 1: Protokoll + Credentials + Verbindungstest
- Schritt 2: Verzeichnis + CSV-Dateien Vorschau
- Schritt 3: Mapping-Template
- Schritt 4: Zeitplan
- Schritt 5: Zusammenfassung + "Integration anlegen"
- Erreichbar über "Integration hinzufügen" auf der Marketplace-Seite (SFTP/FTP-Karte).
- Erklärtext pro Schritt für Erstbenutzer.

i18n en + de für den gesamten Bereich.

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
