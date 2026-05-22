# RESULT: Cycle 5-B — Schedule Builder Rebuild

**Prompt:** `prompts/PROMPT_5-B_SCHEDULE_BUILDER_REBUILD.md`
**Notion:** https://www.notion.so/36824fe1d88a817f9eadeba7b5ffa2a6
**Branch:** develop
**Last commit:** (pending — set after commit)
**Date:** 2026-05-22

---

## Summary

Frontend-only fix for the schedule builder. Interval presets now carry their own `(scheduleType, intervalValue)` and apply both atomically — clicking "15 min" while the type is `interval_hours` now correctly switches type and value together (S15/S16). The wizard Step 5 summary no longer hardcodes English; it shares the localised `formatSchedulePreview` helper exported from `schedule-builder.tsx` (S20). The Edit-Page benefits from R1 without changes because it renders the same `<ScheduleBuilder />` (S25).

## Files changed

- `apps/web/src/components/integrations/schedule-builder.tsx` — `INTERVAL_PRESETS` reshaped to an array of `{ scheduleType, intervalValue, labelKey }`; `setInterval(n)` replaced by `applyPreset(preset)` (sets both `scheduleType` and `intervalValue` atomically); preset buttons gained active highlight state (`value.scheduleType === p.scheduleType && value.intervalValue === p.intervalValue`); preset labels read from `t(p.labelKey)`; `previewSentence` renamed and exported as `formatSchedulePreview` (behaviour-preserving rename, function body unchanged).
- `apps/web/src/components/integrations/setup-wizard.tsx` — `useLocale` added to the existing `next-intl` import; `formatSchedulePreview` imported from `@/components/integrations/schedule-builder`; local `describeSchedule(s)` deleted; `Step5Summary` now pulls `tSchedule = useTranslations('integrations.sftp.scheduleBuilder')` + `locale = useLocale()` and feeds the schedule SummaryRow with `formatSchedulePreview(state.schedule, locale, tSchedule)`.
- `apps/web/messages/en.json` — 5 new keys under `integrations.sftp.scheduleBuilder`: `preset15min` ("15 min"), `preset30min` ("30 min"), `preset1h` ("1 h"), `preset2h` ("2 h"), `preset4h` ("4 h").
- `apps/web/messages/de.json` — 5 new keys under `integrations.sftp.scheduleBuilder`: `preset15min` ("15 Min"), `preset30min` ("30 Min"), `preset1h` ("1 Std"), `preset2h` ("2 Std"), `preset4h` ("4 Std").

## Key decisions made during execution

- **Active-state highlight kept purely derived.** No `useEffect` added to "sync" the active state — `value.scheduleType === p.scheduleType && value.intervalValue === p.intervalValue` derives directly from `value` per render. Editing the number-input to a non-preset value clears the highlight naturally. The prompt's reminder explicitly warned against effect-based sync; followed.
- **Helper exported in place.** The fallback to a new `lib/format-schedule.ts` file was not needed — `formatSchedulePreview` exports cleanly from `schedule-builder.tsx` with no circular-import issue, so both `ScheduleBuilder` and the wizard's `Step5Summary` import from the same module.
- **No Edit-Page changes.** Verified `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx:573` still renders `<ScheduleBuilder value={scheduleValue} onChange={setScheduleValue} />` post-5-A.5 — R1's preset fix propagates with no touch needed (S25).
- **Preset visibility gating unchanged.** The preset row stays inside the `interval_minutes || interval_hours` conditional block (presets are an interval-specific affordance). Cross-type preset clicks work because the visible row is interval-type-gated, but inside that row a preset can still flip from one interval type to the other (which was the bug).
- **`previewSentence` → `formatSchedulePreview` is a pure rename.** Function body unchanged (locale + t passed in, same switch on `scheduleType`, same i18n keys consumed). No tests existed to break.

## Skipped or deferred

- **S17 (multi-time daily schedules)** — already deferred to backlog before this cycle. KNOWN_TODOS entry "Schedule: multiple times-of-day per daily run (Cycle 5-B deferral, S17, 2026-05-22)" still present, no change.
- **Timezone picker** — pre-existing KNOWN_TODOS entry, unchanged.

No new TODOs surfaced.

## Tests

No new tests (frontend, no test infrastructure yet — tracked separately under "Frontend test infra still missing" in KNOWN_TODOS). Verification:

- `pnpm -C apps/web typecheck` — clean.
- `pnpm -C apps/web build` — green; `/integrations/automatic/[id]` first-load JS 5.98 → 6.57 kB (helper export + `useLocale` in wizard); `/integrations/automatic` 5.46 → 5.37 kB.
- `pnpm -C apps/web lint` — 0 errors, 3 pre-existing warnings on untouched files (`stock/movements/page.tsx`, `mobile-sidebar.tsx`, `sidebar.tsx`).

## Codex review

Not run for this cycle. `review:skip` per the prompt — frontend-only, no data-flow / auth / backend surface; the change is mechanical (preset reshape + i18n + function rename/export).

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` (N/A — no new TODOs; S17 entry was already added pre-cycle)
- [x] Notion entry → ✅ Ausgeführt
- [x] This result file written
