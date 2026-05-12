# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-12 (Batch 4 fast abgeschlossen — 4-A bis 4-C done, 4-D Filter-Fix läuft, danach Merge + Deploy)

---

## Context

**Batch 1–2** abgeschlossen. Auf `main`.

**Batch 3** abgeschlossen + deployed. Cycles 3-A bis 3-E. 83 Backend-Tests grün. Redis (Upstash) live. Prisma-Migrations in CI/CD.

**Batch 4** in Arbeit — Fixes aus Batch-3-Review. Cycles 4-A (Marketplace ✅), 4-B (Filter-Versuch ✅), 4-C (SFTP Button/Wizard-Auswahl ✅), 4-D (Filter-Fix final, läuft). Auf `develop`, Merge nach 4-D.

---

## 🟢 Nächster Schritt: Merge Batch 4 + Deploy

Nach Cycle 4-D:
```
git checkout main && git merge develop --ff-only && git push
```

Dann Production-Review für 4-A + 4-D (Marketplace + Filter).

---

## 🟡 SFTP Deep-Dive — nächster Chat / Batch 5

Gesammelte Findings aus Batch 3 + 4 Reviews. Alle betreffen die SFTP/FTP Config-Seite und den Automatic-Integrations-Bereich.

### Bugs

**S1 — Geister-Integration bei "Direkte Konfiguration" (HIGH)**
Beim Klick auf "Direkte Konfiguration" wird sofort eine SFTP-Integration per API erstellt, BEVOR der User irgendetwas konfiguriert hat. Navigiert er zurück ohne zu speichern, bleibt eine leere "SFTP Import"-Integration übrig. Fix: Integration erst erstellen wenn der User "Speichern" klickt. Die Config-Seite muss als Create-Modus (ohne Integration-ID) funktionieren können.

**S2 — SFTP-Integrationen nicht löschbar (HIGH)**
Auf der Automatic-Integrations-Seite (`/integrations/automatic`) kann man SFTP-Integrationen deaktivieren (Toggle), aber nicht löschen. Es fehlt eine Delete-Option (z.B. im Drei-Punkte-Menü oder als Button auf der Config-Seite). Delete sollte den User fragen, ob zugehörige Schedules + Credentials mitgelöscht werden sollen.

### UX/Visual Polish

**S3 — Breadcrumb-Style auf Config-Seite**
"Zurück zur Übersicht" ist kein richtiger Breadcrumb. Soll dem Muster der Produkt-Detail-Seite folgen (Bestand / Movements-Style Breadcrumb im sticky Header).

**S4 — Health-Info bei neuer Integration unsinnig**
Config-Seite zeigt "Letzter erfolgreicher Sync", "Letzter Fehler", "Aufeinanderfolgende Fehler" auch bei frisch angelegten Integrationen ohne einen einzigen Run. Diese Felder nur anzeigen wenn mindestens ein Import-Run existiert.

**S5 — Header-Layout Config-Seite**
"SFTP" + "Unerkennbar" + Toggle in einer Zeile oben. "Unerkennbar" ist kein sinnvoller Typ-Label. Toggle-Positionierung überarbeiten. Typ-Badge mittig setzen (gilt auch für die Karten auf der Automatic-Seite).

**S6 — Marketplace: Install-Count-Badge Position**
Badge ("1x installiert") sitzt an ungünstiger Position im App-Store-Modal. Besser: oben rechts in der Card-Ecke (farblich hinterlegt), oder inline neben dem Install-Button.

**S7 — Marketplace: Katalog schließen nach Installation**
Nach erfolgreicher Installation soll das App-Store-Modal schließen und der User auf der Marketplace-Übersicht mit aktiven Integrationen landen (nicht im offenen Katalog bleiben).

**S8 — Wizard Step 2: Directory-Browser entfernt**
Cycle 4-A hat den Directory-Browser aus dem Wizard entfernt (weil kein `integrationId` vor Submit). Muss im SFTP-Deep-Dive wieder rein — eventuell mit temporärer Credential-basierter Browse-Fähigkeit.

---

## 🟠 Review-Findings für spätere Batches

### Schema-Changes (M–L, Backend + Frontend)
7. ~~**Movements-Quelle granularer**~~ — teilweise in Cycle 3-C adressiert.
10. **Lager + Lagerplatz Pflichtfeld-Kaskade** — Default-Hierarchie.
11. **CSV Duplikat-Handling** — drei Modi.
13. **Bestandswert-Feature** — Kostenfeld.

### Meta / Infra
9. **Performance/Smoothness** — Skeleton-Loader, schnellere Seitenübergänge.
12. **Website + Help Center** — Feature-Dokumentation.
14. **Öffentliche Roadmap** — auf der Website.

---

## 🟠 Backlog (bestehend)

- **Frontend test infra cycle** — React Testing Library setup.
- **CI test-blocking flip** — change CI to blocking.
- **Staging-System** — sobald erste Kunden live.
- **Idee #16 — Import-Undo.**
- **CSV stock export** — 2–3 Cycles.
- **CSV i18n migration** — translatable error codes.
- **CSV mapping editor: re-run delimiter detection after user override.**
- **Server-side sorting.**
- **Bulk-select + bulk-delete für Stock page.**
- **Marketplace mutation toasts under masked-success transport failures.**
- **Marketplace integration rename after install.**
- **Identity-lock list-view completeness.**
- **Stock list `productId` deploy-skew defensive guard.**
- **CSV stock import: storage-location silent fallback.**
- **CSV stock import: dry-run "created" mismatch.**
- **CSV stock import: `batchTracking=false` silently drops batch columns.**
- **`StockMovementChart.selectedRangeMs` prop deprecated.**
- **Marketplace `singleton` flag** — per-entry single-install enforcement.
- **Deprecated bulk uninstall endpoint** — remove `DELETE /marketplace/:key/uninstall`.
- **Dedicated SFTP install endpoint** — replace indirect `INTERNAL_INTEGRATIONS` path.
