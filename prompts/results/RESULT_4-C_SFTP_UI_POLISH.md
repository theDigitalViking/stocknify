# RESULT: Cycle 4-C — SFTP UI Polish: Button-Position + Wizard/Direkt-Auswahl

**Prompt:** `prompts/PROMPT_4-C_SFTP_UI_POLISH.md`
**Notion:** https://www.notion.so/35e24fe1d88a816b9b42fc9bdc55fea6
**Branch:** develop
**Date:** 2026-05-12

---

## Summary

Moved the "Integration hinzufügen" button on `/integrations/automatic` out of the sticky `PageHeader` into a section row below it, matching the Marketplace page layout (F4). Wrapped the button click in a small choice dialog that lets the operator pick between the guided `SetupWizard` and a direct-config path that installs an empty SFTP integration and navigates straight to its config page (F5). Frontend-only cycle; no backend changes.

## Files changed

- `apps/web/src/app/(dashboard)/integrations/automatic/page.tsx` — moved the add button below `<PageHeader>` into a flex row with the new `activeTitle` heading; both the header button and the empty-state "Erste Integration anlegen" button now open the new `AddMethodDialog`. Added the dialog as a sibling component in the same file (Wand2 + SlidersHorizontal cards, max-w-sm); direct path calls `useInstallIntegration({ key: 'sftp', name: 'SFTP Import' })` and `router.push` on success, error → destructive toast.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — added under `integrations.sftp.list`: `activeTitle`, `addMethodTitle`, `addMethodWizard`, `addMethodWizardDescription`, `addMethodDirect`, `addMethodDirectDescription`, plus `addDirectFailed` for the new toast.

## Key decisions made during execution

- **Dialog over DropdownMenu / Popover.** Prompt offered three implementation options for the chooser. Chose Dialog because a two-card layout reads as a clear product decision (icon + title + description per card) where a dropdown would compress the descriptions to muted secondary text. `max-w-sm` keeps it compact.
- **`router.push` instead of an in-page state switch.** The config page is a dedicated route (`/integrations/automatic/[id]`) — there's no in-page edit view to swap into, so the direct path always navigates.
- **`addDirectFailed` toast key, not silent.** Added a destructive toast for the direct-config install failure so the operator sees the same surface they'd get on any other API failure. The wizard path keeps its existing error handling inside `SetupWizard`.
- **Used `setChooserOpen(false)` before opening the wizard.** The Radix Dialog instances are independent, but closing the chooser first prevents a brief frame where two dialogs sit on the same overlay stack.
- **Default name `'SFTP Import'` for the direct-install.** The prompt explicitly mentions this default; the user can rename later via the marketplace-rename TODO (still pending — KNOWN_TODOS, Frontend section). Until that lands, the operator can re-install and uninstall to get a fresh row with a different name via the wizard path.
- **No spinner on the Wizard card.** The Wizard card just opens a modal — no async work to spin against. Only the Direct card swaps its icon to a `Loader2.animate-spin` while `install.isPending`.

## Skipped or deferred

- **No real "instance name" prompt on the direct path.** The direct path uses a static `'SFTP Import'` default — there is no inline name field on the chooser. Adding one would either inflate the chooser to two screens or add a second dialog after the choice. Operators who need a specific name from day one can still take the wizard path (the wizard already collects a name). The eventual fix is the post-install rename, tracked under the existing "Marketplace integration rename after install" TODO. No new entry.
- **No per-card health status on the cards** — out of scope; existing KNOWN_TODOS entry stands.

## Tests

- `pnpm -C apps/web typecheck` — clean, no errors.
- `pnpm -C apps/web build` — clean. `/integrations/automatic` first-load JS rose from ~4 kB to 5.01 kB (246 kB total) — the new dialog code path plus `Wand2`/`SlidersHorizontal` icons. Acceptable.
- No automated UI tests (frontend test infra still pending per testing-strategy in KNOWN_TODOS).

## Codex review

Not run for this cycle. `Review: review:skip` in the prompt — purely visual UX change with no schema, backend, or data-flow surface.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (or N/A) — N/A; no new tech debt.
- [x] Notion entry → ✅ Ausgeführt
- [x] This result file written
