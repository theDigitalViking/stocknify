# RESULT: Marketplace install-name render fix

**Prompt:** `prompts/PROMPT_MARKETPLACE_NAME_FIX.md`
**Notion:** https://www.notion.so/35424fe1d88a816dab56d4bc34d2f356
**Branch:** develop
**Last commit:** `adbd33e` — fix(api): return persisted Integration.name in marketplace catalog
**Date:** 2026-05-02

---

## Summary

Fixed the read path of `GET /integrations/marketplace/catalog` so it returns the persisted `Integration.name` instead of the static catalog default. Custom names entered at install time (e.g. `central test` for a Xentral install) now appear on the marketplace cards. Two-line backend change, no frontend touched.

## Files changed

- `apps/api/src/routes/integrations/index.ts` — extended the `findMany` `select` block to include `name: true`; changed the response mapper from `name: entry.name` to `name: row?.name ?? entry.name`. Two lines net.

## Key decisions made during execution

None. Prompt was prescriptive (two-line edit) and the pre-flight check matched the prompt's diagnosis exactly.

## Pre-flight findings

1. **Install endpoint persists `name` correctly.** Confirmed at `apps/api/src/routes/integrations/index.ts:152` (`const resolvedName = parsedBody.data.name?.trim() || entry.name`) and `:175` (`name: resolvedName` in `request.db.integration.create`). Write path is fine.
2. **Catalog endpoint did NOT select `name` and used `entry.name` unconditionally.** Confirmed at `:55-60` (no `name` in `select`) and `:70` (`name: entry.name`). Diagnosis matches.
3. **Frontend consumes `integration.name` directly.** Confirmed at `apps/web/src/components/integrations/marketplace-integration-card.tsx:88` (`<p ...>{integration.name}</p>`). No transformation, no `key` fallback.

All three confirmations matched the prompt — no deviation required.

## Diff

```diff
@@ -55,6 +55,7 @@ export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
         select: {
           id: true,
           marketplaceKey: true,
+          name: true,
           isEnabled: true,
           createdAt: true,
         },
@@ -67,7 +68,7 @@ export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
         const row = byKey.get(entry.key)
         return {
           key: entry.key,
-          name: entry.name,
+          name: row?.name ?? entry.name,
           description: entry.description,
           category: entry.category,
           logoUrl: entry.logoUrl,
```

## Skipped or deferred

Nothing. Prompt scope was self-contained.

## Tests

- `pnpm -C apps/api typecheck` → pass (clean tsc).
- `pnpm -C apps/api lint` → 0 errors, 11 pre-existing warnings (import-order in unrelated files: products, stock-types, stock, tenant). None from the changed file.
- No automated test suite for this surface yet — Test-Harness-Foundation cycle is queued next per NEXT.md.

## Manual verification (to be done post-deploy)

After Vercel + Hetzner deploy from `develop`:

- [ ] Install a fresh marketplace integration via the UI with a custom name. Card on `/integrations/marketplace` shows the custom name, not the catalog default.
- [ ] Uninstall and reinstall without a name → card shows the catalog default (fallback path works).
- [ ] Existing pre-fix integrations where the persisted name differs from the default (e.g. `central test` on Xentral) now render with their persisted names without re-installing.

## Codex review

Not run for this cycle. Per the prompt and DECISIONS 2026-04-16: ergonomics-grade, render-only, two-line read-path fix with no security/data-integrity/correctness exposure. NEXT.md explicitly noted "Codex review optional, Push direkt." for this cycle.

## Memory Bank updates

- [x] `STATE.md` updated — added fix bullet under "What's deployed and working", refreshed last-updated, refreshed "What's uncommitted".
- [x] `KNOWN_TODOS.md` — N/A (no Codex round, no deferrals from this cycle).
- [ ] Notion entry → ✅ Ausgeführt (deferred to Claude Chat — Claude Code does not have direct Notion MCP write here).
- [x] This result file written.
