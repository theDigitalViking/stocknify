# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-05-02 (Cycle A in flight; Test-Harness-Foundation cycle inserted before Cycle B per Sebastian's testing-strategy decision)

---

## Context

Stabilization-Track ist **abgeschlossen**, alle drei Cycles seit 2026-04-29 (Marketplace polish 2, Stock-overview navigation polish, CSV row-error sanitization broadened) sind auf `main` gemerged.

Frontend-Review hat 15 Bugs/Ideen + 1 geparkte Idee ergeben. Triage gebündelt zu fünf Cycles (A–E). **Cycle A läuft im aktuellen Chat** (Diagnose abgeschlossen, Bug ist im Backend-Catalog-Endpoint, nicht im Frontend).

**Testing-Strategie entschieden (2026-05-02, hybrid Option D):** Stocknify hat heute keine Tests (Vitest-Config existiert, ungenutzt; KNOWN_TODOS bestätigt). Statt im laufenden Cycle nachzurüsten oder bis Phase-4-Ende zu warten:

1. Cycle A bleibt testfrei (XS-Fix, manuelle Verify reicht).
2. Direkt nach Cycle A wird ein dedizierter **`TEST_HARNESS_FOUNDATION`**-Cycle eingeschoben (M-Größe, Backend-Test-Infra: `buildTestApp()`-Factory, Test-DB-Strategy, Auth-Mock, Smoke-Test, CI-Hook).
3. Ab Cycle B gilt: jeder Cycle mit Backend-Touch bringt mind. 1 Test für das angefasste Endpoint-Surface mit. Frontend-Tests bleiben out of scope, bis ein dedizierter Frontend-Test-Cycle gebaut wird (KNOWN_TODOS).
4. Coverage-Requirements und TDD-Pflicht sind explizit nicht eingeführt (würde Solo-Operator-Workflow zerschießen).

Details siehe Notiz in KNOWN_TODOS.md unter "Testing strategy".

---

## 🟢 Active cycle (currently in chat)

### Cycle A — Marketplace install-name render fix
- **Type:** Fix
- **Surface:** Backend, `apps/api/src/routes/integrations/index.ts`, `GET /integrations/marketplace/catalog`
- **Diagnosis (from Chat-side pre-flight):** The catalog listing endpoint doesn't `select` the persisted `Integration.name` from the DB and unconditionally returns the static catalog default. The install endpoint persists `resolvedName` correctly — bug is purely on the read path.
- **Fix:** two-line edit. Add `name: true` to the `select`, change `name: entry.name` to `name: row?.name ?? entry.name` in the response mapper.
- **Estimate:** XS, < 15 LOC. Codex skipped (no security/data-integrity surface). Tests skipped (Test-Harness-Foundation comes next, not here).
- **Prompt:** `prompts/PROMPT_MARKETPLACE_NAME_FIX.md`
- **Notion:** https://www.notion.so/35424fe1d88a816dab56d4bc34d2f356

---

## 🟡 Queued cycles (next chat opens these in order)

### Cycle TH — Test-Harness Foundation (NEW, inserted before Cycle B)
- **Type:** Infrastructure
- **Why now:** Stocknify ships features faster than it tests them. Codex Review + Vercel Preview catch a lot but not runtime regressions. Cycle B introduces a deliberate behaviour-change in `upsertStockLevel` (idempotent skip removed) — a perfect first pilot test, but only if the harness exists. This cycle puts the harness in place so Cycle B can be the first cycle that ships with a test.
- **Scope:**
  - **Test-app factory** — `apps/api/src/test/build-app.ts` exporting `buildTestApp()` that returns a Fastify instance configured for in-process testing (no `listen`, light-touch plugin registration mirroring `server.ts`).
  - **Test-DB strategy** — dedicated Postgres schema per Vitest worker (`vitest_w<N>`), Prisma-applied via `prisma migrate deploy` in `globalSetup`, `TRUNCATE ... RESTART IDENTITY` between tests via `beforeEach`. RLS stays enforced — tests set `app.current_tenant_id` explicitly via the same mechanism the prod tenantMiddleware uses. Decision point: dedicated test-DB on Supabase (cheap) vs. Postgres in Docker for CI vs. testcontainers. Document the choice in `DECISIONS.md`.
  - **Auth mock** — test helper that fakes a verified Supabase JWT for a given `tenantId` + `userId`, bypasses signature verification only when `NODE_ENV=test`. Strict guard: never reachable in prod.
  - **Smoke test** — one passing test that exercises `GET /health` plus one tenant-scoped read (e.g. `GET /products` with seeded fixture) to prove the harness is wired end-to-end.
  - **CI integration** — extend `.github/workflows/ci.yml` (or wherever tests run) to run `pnpm -C apps/api test` after typecheck and before build. Non-blocking initially (failing test = warning, not red CI). Flip to blocking after 5 cycles in NEXT.md tracking.
- **Out of scope (explicit):**
  - **Frontend test infra.** Web app gets nothing in this cycle. Different concern, different ROI, future cycle.
  - **Tests for existing features.** No retroactive coverage. Cycle B is the first feature cycle that ships with a test.
  - **Mock factories beyond auth.** Don't build a generic Prisma mock — tests run against a real test-DB with real RLS, not a mocked one. That's the whole point.
  - **E2E / Playwright.** Out of scope. Decision: only after onboarding-flow has been stable for ≥30 days.
- **Estimate:** M (4–8 hours of Claude Code work). Includes the harness, the smoke test, the CI hook, and a `DECISIONS.md` entry documenting the test-DB choice.
- **Codex review:** Yes — infra cycle, security-adjacent (auth mock), worth the round.

### Cycle B — Bestände-Tabelle Polish + Re-Upload Behavior
- **Type:** Fix + small refactor (now also: first cycle that ships with a Backend test)
- **Items:**
  - **#9** Bestandswert-Spalte fehlt in der Quick-View-Bestands-Tabelle — ergänzen.
  - **#10** „Charge (MHD)" als zwei Spalten splitten — `Charge` und `MHD` getrennt.
  - **#13** **Verhaltenswechsel:** `upsertStockLevel`'s `if (currentQty.equals(newQty)) return 'skipped'` rausnehmen. Jeder Upload erzeugt einen `stock_movements`-Eintrag, auch bei identischer Menge. Im Frontend soll man sehen, dass *etwas hochgeladen wurde*, auch wenn die Mengen identisch sind.
  - **#14** Manuelle Bestandsanpassung deaktivieren — `ManualAdjustDialog` aus der UI raus, ggf. Backend-Endpoint deprecaten. Stocknify spiegelt Bestände, manipuliert sie nicht.
  - **#15** Drei-Punkte-Menü auflösen — wenn nur noch „Bewegungen anzeigen" übrig, dann zum Icon in der Aktionsspalte machen. Passt zur Chart-Idee in Cycle E.
  - **NEU: Backend test for `upsertStockLevel` behaviour change.** First test under the freshly-built harness. Asserts that identical-quantity upsert still appends a `stock_movements` row. Acceptance: 1 passing test under `apps/api/src/services/stock/__tests__/` (or wherever the harness convention lands in Cycle TH).
- **Estimate:** M (slightly larger now with the test).
- **Behaviour-Change-Note:** #13 muss explizit dokumentiert werden, sonst regressed der nächste Codex es zurück mit „idempotent skip is correct". Begründung: Upload-Sichtbarkeit > Idempotenz, und für den Chart in Cycle E brauchen wir die lückenlose Movement-History. The new test pins the behaviour so the regression can't happen silently.

### Cycle C — Produkt-Detailseite Refactor
- **Type:** Refactor (Frontend-only)
- **Items:**
  - **#4** Header neu: nur Name, Beschreibung, Einheit, MHD-/chargengeführt. SKU/EAN/Barcode raus aus dem Header (sind variantenspezifisch).
  - **#5** Variantenwahl steuert Bestand- und Integrations-Sektionen reaktiv. Variantentabelle wird zum Steuerelement: Klick auf Variante → unten erscheinen Bestand und Integrationen für genau diese Variante.
  - **#6** Quelle-Icon raus aus dem Produkt-Header (wirkt wie ein Edit-Icon, ist verwirrend).
  - **#7** Quelle-Icon als neue Spalte in der Variantentabelle. Begründung: Hauptprodukt + Varianten können unterschiedliche Quellen haben (CSV-Hauptprodukt, manuell hinzugefügte Variante).
  - **#8** Edit/Delete als beschriftete Buttons im Header. Löschen rot. Icons dürfen bleiben, aber als Buttons erkennbar (nicht nur Icon).
- **Estimate:** M
- **Tests:** None this cycle — frontend-only, harness covers backend only. Manual verification + Codex.
- **Backend-Touch:** wahrscheinlich keiner — `GET /stock` ist schon variant-scoped, Integrations-Sektion existiert noch nicht und wird in dieser Form neu gebaut.

### Cycle D — Produkte-Liste Polish + Soft-Delete Restore
- **Type:** Feature (Reaktivierung) + small UI
- **Items:**
  - **#2** Soft-deleted Produkte reaktivierbar machen. Backend: `POST /products/:id/restore` (oder PATCH mit `deletedAt: null`). Frontend: Toggle „inkl. gelöschte" oder eigener Tab + Reaktivieren-Button. Optional: zeitliche Begrenzung (z.B. innerhalb 30 Tagen).
  - **#3** Detail-Icon (Eye) in der Aktionsspalte der Produkte-Liste, neben Stift und Mülltonne. Aktuell führt nur der Name-Link auf die Detailseite — Icon macht das Affordance explizit.
  - **NEU: Backend test for `POST /products/:id/restore`.** New endpoint = mandatory test. Coverage: restore happy path, restore on already-active product (409 or no-op?), restore across tenants (must 404 / RLS-blocked).
- **Estimate:** S–M

### Cycle E — Bestands-Verlauf + Chargen-Liste
- **Type:** Feature (größtes Stück, sauber als letztes)
- **Items:**
  - **#12** Bestands-Verlauf-Surface mit Chart + Bewegungstabelle. Klick auf Bestandszeile (Variante × Lager × Lagerplatz × Charge) öffnet Verlaufsansicht. Oben: Chart (Mengen-Kurve über Zeit) — Recharts (schon im Stack). Unten: Tabelle der Bewegungen. Zeitraum-Buttons: 1 Tag, 3 Tage, 1 Woche, 1 Monat, alle. Date-Picker out of scope für MVP. Historie wird durch Lizenz-Tier gekappt (PROJECT.md §10: Trial 7d / Starter 30d / Growth 1y / Enterprise unlimited).
  - **#11** Chargen-Liste als eigener Block auf der Produkt-Detailseite. Pro Charge: Chargennummer, MHD, Summe der Mengen über alle Lagerplätze, Status (aktiv / fast abgelaufen / abgelaufen). Klick auf eine Chargen-Zeile → Verlaufsansicht in Charge-Skin.
  - **NEU: Backend tests for `GET /stock/movements`.** New endpoint = mandatory tests. Coverage: filter by variantId / locationId / batchId / date range, RLS isolation across tenants, license-tier date-cap enforcement.
- **Estimate:** L
- **Backend-neuer-Endpoint:** `GET /stock/movements` mit Filter-Parametern (variantId, locationId, storageLocationId, batchId, fromDate, toDate). Schemamäßig schon vorhanden — `stock_movements` ist bereits beschrieben mit `quantityBefore`, `quantityAfter`, `delta`, `movementType`.

---

## 🟠 Backlog (post-Cycle-E)

- **Frontend test infra cycle** — React Testing Library setup for the Web app, prioritized to hooks (`useMarketplaceCatalog`, `useImportStock`, `useDeleteProducts`) over UI components. Decision deferred until backend test discipline has held for ≥3 cycles post-TH.
- **CI test-blocking flip** — after 5 cycles where the harness has been used, change CI from "tests are warnings" to "test failure = red CI". Tracked here as a future tightening; current default keeps the harness from blocking shipping during its bedding-in period.
- **Idee #16 — Import-Undo.** Kompletten CSV-Import (Produkt oder Bestand) rückgängig machen können. Verortung in der UI noch offen — vermutlich auf der Detailseite eines Imports oder im Verlauf. Implementierung non-trivial: braucht eine `import_id` oder ähnliches als FK auf `stock_movements` / `products`, plus Rollback-Endpoint, plus Affordance in der UI. Geparkt bis Sebastian die Verortung klärt.
- **CSV stock export** — Schema-Decision (export-template flow distinct from import templates per DECISIONS 2026-04-18) + Full-Stack-Cycle. 2–3 Cycles.
- **CSV i18n migration** — Move row-error reasons from English literals to translatable error codes.
- **CSV mapping editor: re-run delimiter detection after user override.**
- **Server-side sorting** (currently client-side; backend ignores `sortBy` / `sortDir`).
- **Bulk-select + bulk-delete für Stock page.**
- **Marketplace mutation toasts under masked-success transport failures** — pre/post-state-diff layer (Codex 2026-04-29 round-2 deferral).
- **Marketplace integration rename after install** — PATCH constraint lift oder dedicated rename endpoint.
- **Identity-lock list-view completeness** — `hasExternalReferences` auf List-Endpoint.
- **Stock list `productId` deploy-skew defensive guard** (Codex 2026-04-30 deferral).
- **CSV stock import: storage-location silent fallback** (KNOWN_TODOS — narrow surface, MVP-tolerable).
- **CSV stock import: dry-run "created" mismatch for batched rows.**
- **CSV stock import: `batchTracking=false` silently drops batch columns.**
