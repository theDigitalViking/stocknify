# RESULT: Cycle 5-A — Ghost Integration Fix + Delete-Konsistenz

**Prompt:** `prompts/PROMPT_5-A_GHOST_INTEGRATION_DELETE.md`
**Notion:** https://www.notion.so/35e24fe1d88a81eeb4a0fb11e5e32ac7
**Branch:** develop
**Last commit:** (set on commit — Cycle 5-A feature commit)
**Date:** 2026-05-13

---

## Summary

Three frontend findings from Sebastian's Batch-4 walk-through closed in one cycle. S1: "Direkte Konfiguration" no longer creates a ghost integration row — clicking the card now opens an inline name dialog and only the explicit Erstellen/Create press fires the install API call. S2 + S27: SFTP/FTP cards on `/integrations/automatic` and the edit-page header both gained a three-dot dropdown with a "Löschen" item that opens a confirm dialog and calls the per-instance `DELETE /v1/integrations/:id` (Cycle 4-A semantics, no backend touch). `useUninstallIntegration` additionally invalidates `['integrations-list']` so the SFTP list refreshes after a delete; the marketplace-catalog invalidation stays.

## Files changed

- `apps/web/src/app/(dashboard)/integrations/automatic/page.tsx` — `AddMethodDialog` no longer owns the install mutation; it just routes via a new `onPickDirect` prop. A new inline `SftpNameDialog` owns the install with cancel/create buttons, Enter-to-submit (wrapped in `<form>`), Loader2 spinner while pending, and routes to the edit-page on success. `AutomaticCard` gained a three-dot `DropdownMenu` (mirroring `marketplace-integration-card.tsx`) with one "Löschen" item that opens a confirm dialog using `useUninstallIntegration`. Added imports: `MoreVertical`, `Input`, `Label`, `DialogFooter`, `DropdownMenu*`, `useUninstallIntegration`, `useEffect`.
- `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` — header gained a three-dot dropdown to the right of the Switch with a "Löschen" item that opens an identical confirm dialog; success → `router.push('/integrations/automatic')`. Added imports: `MoreVertical`, `useRouter`, `Dialog*`, `DropdownMenu*`, `useUninstallIntegration`. Re-uses the `integrations.sftp.list.*` translation namespace for the delete copy (single source of truth shared with the card flow).
- `apps/web/src/lib/api/use-integrations.ts` — `useUninstallIntegration.onSettled` now invalidates both `['marketplace-catalog']` and `['integrations-list']`. Marketplace cards still need the catalog refresh; the SFTP list page reads from `useIntegrationsList` which keyed off `['integrations-list', type]`.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — 14 new keys under `integrations.sftp.list` (`directNameDialogTitle`, `directNameDialogDescription`, `directNameLabel`, `directNamePlaceholder`, `directNameCreate`, `directNameCreating`, `cardActions`, `cardDelete`, `deleteConfirmTitle`, `deleteConfirmDescription`, `deleteConfirm`, `deleting`, `deleteSuccess`, `deleteFailed`).

## Key decisions made during execution

- **Inline `SftpNameDialog` instead of reusing `MarketplaceInstallDialog`.** The prompt's "Reminders" section flagged the marketplace component as catalog-coupled (logo, description, key all from the catalog payload). SFTP lives in `INTERNAL_INTEGRATIONS` — it has no catalog entry, so faking one would widen the marketplace component's surface for one caller. The inline dialog is ~50 lines and reads cleanly next to `AddMethodDialog`. If a third "name-only install" path appears we'd promote both inline dialogs to a shared component then.
- **Dropdown placement on the card: right of the Switch, in a sibling flex group.** Marketplace cards put the dropdown next to the logo at the top-right; the SFTP card has no logo, so the natural spot is right of the toggle. Wrapped Switch + dropdown in a `flex items-center gap-2 flex-shrink-0` so they cluster as one control group at the right end of the header row. Tested mentally against the lg:grid-cols-2 layout — looks balanced.
- **Used `text-destructive focus:text-destructive` on the destructive `DropdownMenuItem` instead of plain `text-destructive`.** The shadcn default focus style overrides text color on keyboard navigation; pinning both states keeps the red signal visible during arrow-key traversal. Matches the destructive-button color cue but on the item-level. The marketplace card's dropdown item doesn't carry this class (its "Uninstall" is a one-shot too but uses the default treatment) — judgment call to follow the prompt's explicit "text-destructive" steer rather than copy the marketplace styling 1:1.
- **Reset `name` input state on dialog open via `useEffect` keyed on `open`.** Without it, dismissing the dialog mid-type and re-opening it would show the stale value. The prompt's "pre-fill with empty string, let placeholder show default" intent is preserved.
- **Empty `name.trim()` falls back to `'SFTP Import'` on submit, not on default-value-write.** The placeholder still shows "SFTP Import" so the user sees the default visually; submit-time fallback means the actual mutate body always carries an explicit non-empty name. Matches the prompt's "submit with empty → name = 'SFTP Import'" acceptance criterion.
- **Re-used `integrations.sftp.list.*` for the edit-page's delete copy (option (b) from the prompt).** The prompt offered duplicating the keys under `integrations.sftp.config.*` or reaching across namespaces; option (b) is the single-source-of-truth path. Pulled `tSftpList` + `tCommon` as new translations on the edit-page; `t` (the existing `integrations.sftp.config` translation) keeps its scope.
- **`useUninstallIntegration` invalidation is additive, not a replacement.** Marketplace integration cards still call the same hook (`MarketplaceIntegrationCard`); they need the catalog cache to refresh. Adding `integrations-list` invalidation is harmless for marketplace (their cards don't read from that key) and required for SFTP (which does). The hook is now correct for both consumers.
- **`Trash2` and `Save` imports on the edit-page are kept** — both are actually used in the schedule section's Save / Delete schedule buttons. The acceptance criterion's "verify these are used or removed" check passes; lint reports zero errors on touched files.
- **Did not modify `useInstallIntegration` invalidation.** The hook already invalidates `marketplace-catalog` on settle (existing behavior). Adding `integrations-list` invalidation would be a nice symmetry but was out of scope for R4; the navigation immediately after install lands on the edit-page, which fetches fresh data via `useIntegration` keyed by id — the list-page cache will refresh the next time the user navigates back, which is also when it's needed.

## Skipped or deferred

- **Notion status flip to ✅ Ausgeführt** — attempted via the Notion MCP tools available in this session. If the call fails or the tools aren't reachable, this line stays open and Sebastian / Claude (Chat) will flip the status and add the result-file path under "Ergebnis" manually.
- **Codex review** — `review:skip` per the prompt header. Purely UX, no data-flow / auth / backend surface changed. The DELETE endpoint and install handler are unchanged; only the frontend trigger pattern moved.
- **No new KNOWN_TODOS entries.** The cycle closed S1/S2/S27 cleanly; nothing was deferred that wasn't already a non-goal.

## Tests

- `pnpm -C apps/web typecheck`: clean.
- `pnpm -C apps/web build`: green. `/integrations/automatic` first-load JS 5.01 → 5.46 kB (added Input/Label/Dialog/DropdownMenu primitives + the inline name dialog). `/integrations/automatic/[id]` 5.81 → 5.98 kB (added Dialog + DropdownMenu wiring for the header).
- `pnpm -C apps/web lint`: 0 errors, 3 pre-existing warnings on files this cycle did not touch (`stock/movements/page.tsx` exhaustive-deps, `sidebar.tsx`/`mobile-sidebar.tsx` import-order — all pre-existing).
- No new tests added — frontend test infra is still queued (see `KNOWN_TODOS.md` § Frontend test infra still missing). When that infrastructure lands, target tests: name-dialog empty-input → default-name install body, delete confirm cancel → no API call, delete confirm submit → mutation called with correct id.

## Codex review

Not run for this cycle — `review:skip` per the prompt header (purely UX, no data-flow surface, no auth surface, no backend touch).

## Memory Bank updates

- [x] `STATE.md` updated (Cycle 5-A entry prepended, "Last updated" + "Active phase" bumped, S1/S2/S27 closure noted)
- [x] `KNOWN_TODOS.md` "Last updated" date bumped (no new entries — cycle closed all three findings cleanly)
- [x] `NEXT.md` — S1/S2/S27 stricken through with the cycle completion marker
- [ ] Notion entry → ✅ Ausgeführt (attempted via MCP; falls back to manual if MCP unavailable)
- [x] This result file written
