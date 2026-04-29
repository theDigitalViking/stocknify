# Stocknify — Architecture & Product Decisions

> Append-only log. New decisions go at the top. Format: date, decision, rationale, alternatives considered.

---

## 2026-04-29 — Push policy: Claude Code pushes `develop`; Sebastian merges to `main`

**Decision:** Claude Code runs `git push` to `origin/develop` at the end of a cycle, after the Memory Bank update is committed and (if applicable) Codex review has passed. Sebastian merges `develop` → `main` manually when the accumulated state is review-ready; that merge is the production-deploy gate. Claude Code never pushes to `main` directly. Hotfix flow is unchanged (Sebastian-only, out-of-band).

**Rationale:** With Codex adversarial review running before the push and the `develop` → `main` merge serving as a second human gate, Sebastian's earlier per-push manual step (DECISIONS 2026-04-15) was a redundant ceremony. The merge gate is sufficient — production deploy is still gated on a deliberate human action — and removing the per-push step lets cycles close themselves without a hand-off back to Sebastian for every commit.

**Alternatives considered:** Keep manual push on `develop` for symmetry — rejected as redundant given the merge gate. Allow Claude Code to merge `develop` → `main` after passing tests — rejected; the production gate must be explicitly human.

**Supersedes (in part):** DECISIONS 2026-04-15 ("Deployment ordering"). The strict ordering of *commit → push → deploy* still holds; what changes is **who** runs the push on `develop`. The earlier rationale ("manual push is the only review gate") no longer applies because Codex review and the merge step now serve that role.

## 2026-04-29 — Memory Bank workflow

**Decision:** State between Claude.ai chat sessions lives in `prompts/_state/` (STATE, NEXT, DECISIONS, KNOWN_TODOS), not in chat handover summaries. One Claude.ai chat = one cycle. Claude (Chat) writes prompt files directly into the repo via Filesystem MCP. Claude Code updates the memory bank at the end of every run and flips the Notion status to ✅ Ausgeführt. Sebastian only pushes manually.

**Rationale:** Long Claude.ai chats degrade context and tool reliability. Moving state into the repo also makes it visible to git, diffable, and resilient to chat resets.

**Note (2026-04-29 same day):** The "Sebastian only pushes manually" clause is superseded by the push-policy decision above. Memory Bank workflow itself is unchanged.

## 2026-04-21 — Product identity-lock: source-aware + LOCKED_SOURCES set

**Decision:** SKU and Barcode on a product are read-only when either (a) `metadata.source ∈ LOCKED_SOURCES = {sftp, ftp}`, or (b) the product has any row in `external_references` with `resource_type = 'product_variant'`. Backend rejects PATCH with 409 `PRODUCT_IDENTITY_LOCKED`. CSV-imported products (`metadata.source = 'csv'`) are NOT locked — CSV is user-driven and the user must be able to correct identifiers after import.

**Rationale:** Originally everything non-`'manual'` was locked, but that broke CSV correction workflows. The narrowed set covers genuinely automated pipelines where the external system is the source of truth for the identifier; CSV is a user-mediated import where errors are expected and must be fixable.

**Alternatives considered:** Promoting `LOCKED_SOURCES` to `packages/shared/constants/` — deferred. Three duplicate sites today (two frontend, one backend) cross-referenced via comments. Worth the extraction if a third automated source is added.

## 2026-04-21 — Marketplace install dialog is a generic shell

**Decision:** `MarketplaceInstallDialog` collects a name and shows a placeholder "settings" block. No per-integration form yet. Install endpoint doesn't accept the name field — it's cosmetic in this iteration.

**Rationale:** Real integrations (Shopify, Hive, etc.) need OAuth flows, API-key inputs, and per-integration validation logic. Building a generic shell first lets us ship the marketplace surface without blocking on per-integration UX. Each integration's settings form is its own future cycle.

## 2026-04-21 — CSV stock-level FK semantics

**Decision:** In `upsertStockLevel`'s `findFirst` and update paths, nullable foreign keys (`storageLocationId`, `batchId`) are passed as `null`, not `?? undefined`. Prisma treats `undefined` as "no filter on this column"; passing `null` produces an `IS NULL` filter, which matches the COALESCE-based partial unique index in `apps/api/src/db/sql/unique-stock-levels.sql`.

**Rationale:** The unique index uses `COALESCE(storage_location_id, '00000000-...')` so a NULL bin is a single canonical bucket. Filtering with Prisma `undefined` would match rows with *any* bin and lead to silent double-counting on upsert. Caught during stock-import implementation; the deviation from the prompt's `?? undefined` snippet was correctness-driven.

## 2026-04-21 — Variant resolution: barcode > SKU

**Decision:** In CSV stock import, `resolveVariant` tries barcode first, then SKU. Either alone is sufficient; both columns can map but rows need at least one.

**Rationale:** Barcode (EAN) is the primary stable identifier across fulfillers. Falling back to SKU keeps imports working for variants without scanned barcodes.

## 2026-04-21 — Stock movements tagged `movementType='sync'` for CSV imports

**Decision:** All CSV-driven stock changes write a `stock_movements` row with `movementType='sync'`, matching scheduled-integration sync writes.

**Rationale:** PROJECT.md convention — `'sync'` is "automated change from an external source", which CSV imports functionally are. Adding a separate `'csv_import'` movement type would split the audit query surface without giving operators a meaningfully different signal.

## 2026-04-21 — Cleanup-error precedence: cleanup is primary

**Decision:** When the savepoint cleanup itself fails inside `upsertStockLevel`, the thrown error's primary message is `Savepoint cleanup failed: <cleanupErr.message>`, with the original insert error attached as `{ cause }`. Row-level error logging via `extractErrorMessage` surfaces the cause chain one level deep.

**Rationale:** Cleanup failures signal a deeper systemic issue (connection drop, protocol drift) that the operator must see first. The original insert error is still available via `cause` — useful for understanding *why* cleanup was attempted.

## 2026-04-18 — CSV encoding fallback: silent UTF-8

**Decision:** In `decodeBuffer`, encodings outside the whitelist (`utf-8`, `utf8`, `iso-8859-1`, `latin1`, `windows-1252`) silently fall back to UTF-8 instead of returning a 400 validation error.

**Rationale:** Defends against malicious or corrupted template data triggering an `iconv.decode` throw deep in the streaming pipeline. Tradeoff: masks legitimate misconfiguration. Worth revisiting if this surfaces as user confusion.

## 2026-04-18 — CSV required fields finalized

**Decision:** Name, SKU, Barcode are required and accept only a CSV column (no fixed value). Beschreibung is optional with no fixed value. Kategorie is removed from the CSV mapping dialog (but remains in the schema for future use). Einheit is optional and accepts a fixed value.

**Rationale:** Barcode (EAN) is the primary matching key for stock-level updates from fulfiller systems; making it optional would silently break those imports. SKU and Name are universally required by downstream systems. Kategorie was unused in the manual add dialog and added clutter to the import flow.

**Alternatives considered:** Making Barcode optional with a fallback to SKU — rejected because mixed-mode matching produces false positives across SKU collisions between products from different suppliers.

## 2026-04-18 — Export templates separate from import templates

**Decision:** CSV export templates use a different dialog flow than import templates. No CSV upload step. The user defines which Stocknify fields to export, in what order, with what column header.

**Rationale:** Import templates map external columns → internal fields; export templates do the inverse. Forcing a unified dialog would require a fake "preview file" that misleads users.

## 2026-04-18 — `batchTracking` = MHD- und chargengeführt

**Decision:** The `batchTracking` field represents both best-before-date tracking and batch/lot tracking. They are not split into two fields.

**Rationale:** In DACH e-commerce, products that are batch-tracked are virtually always also MHD-tracked (food, cosmetics, supplements). Separating them would force every user to set both checkboxes and add no expressive power.

## 2026-04-16 — Codex findings policy

**Decision:** Only Codex findings classified as Security, Data Integrity, or Correctness get fixed. Hypothetical, MVP-irrelevant, or deployment-ergonomics findings are documented in `KNOWN_TODOS.md` but not iterated on.

**Rationale:** Single-operator MVP. Concurrent DDL warnings, future Postgres version concerns, and similar are real but not load-bearing at current scale.

## 2026-04-15 — Deployment ordering

**Decision:** The strict order is (1) Claude Code commits → (2) Sebastian manually runs `git push` → (3) CI/CD auto-deploys. Claude Code never runs `git push`.

**Rationale:** Manual push is the only review gate that catches mistakes after Codex review. Removing it removes the gate.

**Superseded in part by 2026-04-29 push-policy decision** (above): on `develop`, Claude Code now runs `git push` itself after Codex review; the production gate moved to Sebastian's manual `develop` → `main` merge. Order *commit → push → deploy* still holds.

## 2026-04-14 — Manual SQL via auto-runner

**Decision:** Manual SQL files (idempotent seeds, RLS policies) are executed automatically by `run-manual-migrations.ts` post-deploy in CI/CD. No manual Supabase SQL editor steps.

**Rationale:** Removes a per-deploy human step that was easy to forget and broke staging twice.
