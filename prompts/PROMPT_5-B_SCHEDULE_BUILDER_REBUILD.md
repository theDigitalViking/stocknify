# PROMPT: Cycle 5-B — Schedule Builder Rebuild

**Phase:** Phase 4
**Area:** Frontend
**Type:** Fix
**Review:** review:skip
**Notion:** https://www.notion.so/36824fe1d88a817f9eadeba7b5ffa2a6

---

## Context

Three findings from Sebastian's Batch-4 walk-through, all in the schedule UI:

1. **S15/S16 — Interval presets are broken.** In `apps/web/src/components/integrations/schedule-builder.tsx`, the `setInterval(n)` helper only converts minute→hour when the *current* type is `interval_minutes` AND `n >= 60`. Click a "15 min" preset while the type is `interval_hours` and the function falls through to `onChange({ …value, intervalValue: 15 })` — `scheduleType` stays `interval_hours`, the preview reads "every 15 hours". The preset clicks are decoupled from the type selector when they shouldn't be. Sebastian himself was fine with keeping presets ("wäre ich da auch fein mit, wenn wir das so machen"), provided they work cleanly. **Fix shape:** each preset carries its own `scheduleType` + `intervalValue` and the click sets both atomically.

2. **S20 — Wizard summary screen is hardcoded English.** `apps/web/src/components/integrations/setup-wizard.tsx` Step 5 calls a local `describeSchedule(value)` that returns strings like `"Weekly on days 1,3,5 at 06:00"` — completely outside the i18n namespace. The schedule builder itself already has a fully-localised equivalent (`previewSentence` in `schedule-builder.tsx`, using the `integrations.sftp.scheduleBuilder.preview*` keys), but it's a private function.

3. **S25 — Edit-Page schedule section** uses the same `ScheduleBuilder` component, so the R1 fix benefits both surfaces synchronously. No separate work.

This is a small, focused cycle. Frontend-only, no backend changes, no schema.

S17 (multiple times-of-day for daily schedules) is deferred to backlog — see KNOWN_TODOS.md entry "Schedule: multiple times-of-day per daily run".

## Non-goals

- **No new schedule types.** The four types (`interval_minutes`/`interval_hours`/`daily`/`weekly`) stay as today.
- **No multi-time-of-day (S17).** Backlog item.
- **No backend changes.** `cron-utils.ts` `describeCron` is unchanged; this cycle's lookup-table localisation lives entirely in the frontend.
- **No timezone picker.** Already noted in KNOWN_TODOS — separate small cycle.
- **No Wizard step refactor.** Only the Summary step's schedule line changes; Steps 1–4 untouched.

## Files involved

**Modified (Frontend):**
- `apps/web/src/components/integrations/schedule-builder.tsx` — preset table reshape, `setInterval` → `applyPreset`, export the preview helper.
- `apps/web/src/components/integrations/setup-wizard.tsx` — Step 5's `describeSchedule` deleted, replaced with the shared helper.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — preset labels.

**Read for reference (no changes):**
- `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` — confirms the Edit-Page still renders `<ScheduleBuilder />` post-5-A.5; the R1 fix propagates here automatically.

## Pre-flight check (mandatory — do this FIRST, before writing any code)

> **TRANSITIONAL** — this section stays in every prompt until the memory bank has stabilized. See WORKFLOW.md § Pre-flight policy.

1. **Confirm the bug shape.** Open `apps/web/src/components/integrations/schedule-builder.tsx` and verify the `setInterval` function still has the minute→hour conversion branch *only* when current type is `interval_minutes`. If Cycle 5-A.5 already refactored this — flag and stop.
2. **Confirm the wizard describe function.** Open `apps/web/src/components/integrations/setup-wizard.tsx`, find `describeSchedule` near the bottom, confirm it's hardcoded English.
3. **Confirm `previewSentence` exists** in `schedule-builder.tsx` and uses i18n keys. The keys it consumes (`previewIntervalMinutes`, `previewIntervalHours`, `previewDaily`, `previewWeekly`, `previewIncomplete`) live under `integrations.sftp.scheduleBuilder.*` — confirm they're in both `en.json` and `de.json`.
4. **Classify** as already-done / partially-done / not-done per the standard checklist.

## Requirements

### R1 — Presets carry their own type + value

In `apps/web/src/components/integrations/schedule-builder.tsx`:

**Reshape the `INTERVAL_PRESETS` constant** to carry the target schedule type and value explicitly, plus an i18n key for the label:

```ts
interface IntervalPreset {
  scheduleType: 'interval_minutes' | 'interval_hours'
  intervalValue: number
  labelKey: 'preset15min' | 'preset30min' | 'preset1h' | 'preset2h' | 'preset4h'
}

const INTERVAL_PRESETS: IntervalPreset[] = [
  { scheduleType: 'interval_minutes', intervalValue: 15, labelKey: 'preset15min' },
  { scheduleType: 'interval_minutes', intervalValue: 30, labelKey: 'preset30min' },
  { scheduleType: 'interval_hours',   intervalValue: 1,  labelKey: 'preset1h' },
  { scheduleType: 'interval_hours',   intervalValue: 2,  labelKey: 'preset2h' },
  { scheduleType: 'interval_hours',   intervalValue: 4,  labelKey: 'preset4h' },
]
```

**Replace `setInterval(n: number)`** with `applyPreset(preset: IntervalPreset)`:

```ts
function applyPreset(preset: IntervalPreset): void {
  onChange({
    ...value,
    scheduleType: preset.scheduleType,
    intervalValue: preset.intervalValue,
  })
}
```

**Update the preset button row** to call `applyPreset(p)` and read labels from i18n:

```tsx
{INTERVAL_PRESETS.map((p) => {
  const isActive = value.scheduleType === p.scheduleType && value.intervalValue === p.intervalValue
  return (
    <button
      key={`${p.scheduleType}-${p.intervalValue}`}
      type="button"
      onClick={() => { applyPreset(p) }}
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] transition-colors',
        isActive
          ? 'border-brand-600 bg-brand-50 text-brand-700'
          : 'border-border bg-background hover:bg-muted',
      )}
    >
      {t(p.labelKey)}
    </button>
  )
})}
```

**Note on preset visibility:** today, the preset row only renders inside the `interval_minutes || interval_hours` block (i.e. only when the user has already picked an interval type). Keep that gating — the presets are an interval-specific affordance. They still work correctly because the preset click can flip the type from `interval_hours` to `interval_minutes` (or vice versa) within the same click.

**Active-state highlight matters for UX feedback.** A user who picks "1 h" should see that preset button highlighted; a subsequent manual edit of the number-input that diverges from any preset value should remove the highlight. The active check `value.scheduleType === p.scheduleType && value.intervalValue === p.intervalValue` handles both cases naturally.

**Cap enforcement stays implicit.** The number-input keeps its `max={value.scheduleType === 'interval_hours' ? 23 : 59}` cap; preset values are all within the cap, so no extra validation needed.

### R2 — Export the preview helper for shared use

In `apps/web/src/components/integrations/schedule-builder.tsx`:

1. **Rename** the private `previewSentence` function to `formatSchedulePreview` and **export it**.
2. **Tighten the signature** so the wizard can call it without faking a `t` function:

```ts
export function formatSchedulePreview(
  value: ScheduleBuilderValue,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  // existing body, unchanged except for the function name in recursive callers
  // (there aren't any — it's a pure function)
}
```

3. **Update the call site** inside `ScheduleBuilder`'s preview card (`previewSentence(value, locale, t)` → `formatSchedulePreview(value, locale, t)`).

The helper signature accepts the `t` returned by `useTranslations('integrations.sftp.scheduleBuilder')` — both the builder and the wizard summary should call `useTranslations('integrations.sftp.scheduleBuilder')` to get the right namespace, then pass `t` through.

### R3 — Wizard summary uses the shared helper

In `apps/web/src/components/integrations/setup-wizard.tsx`:

1. **Delete** the local `describeSchedule(s: ScheduleBuilderValue)` function near the bottom of the file.
2. **In `Step5Summary`**, add `useTranslations` + `useLocale`:

```tsx
function Step5Summary({ … }): JSX.Element {
  const t = useTranslations('integrations.sftp.wizard.step5')
  const tSchedule = useTranslations('integrations.sftp.scheduleBuilder')
  const locale = useLocale()
  …
}
```

3. **Replace the schedule row's value** with the shared helper:

```tsx
<SummaryRow
  label={t('scheduleLabel')}
  value={
    !state.scheduleEnabled
      ? t('manualOnly')
      : formatSchedulePreview(state.schedule, locale, tSchedule)
  }
/>
```

4. Add the import: `import { ScheduleBuilder, formatSchedulePreview, type ScheduleBuilderValue } from '@/components/integrations/schedule-builder'` (or similar — match the existing import shape).

5. The existing `next-intl` import already pulls `useTranslations`; add `useLocale` to the same import statement.

### R4 — i18n keys

Add the preset labels to **both** `apps/web/messages/en.json` and `apps/web/messages/de.json` under `integrations.sftp.scheduleBuilder`:

| Key | EN | DE |
|-----|----|----|
| `preset15min` | "15 min" | "15 Min" |
| `preset30min` | "30 min" | "30 Min" |
| `preset1h` | "1 h" | "1 Std" |
| `preset2h` | "2 h" | "2 Std" |
| `preset4h` | "4 h" | "4 Std" |

The existing `preview*` keys consumed by `formatSchedulePreview` stay as they are (no changes needed — they were already localised correctly).

### R5 — Edit-Page is free

`apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` continues to render `<ScheduleBuilder value={…} onChange={…} />` directly (post-5-A.5: the schedule section holds the builder + active toggle + Save/Delete + next-run timestamp). The R1 fix and the cleaner preview text both propagate automatically — no Edit-Page changes in this cycle.

## Acceptance Criteria

- [ ] Clicking "15 min" preset while type is `interval_hours` switches type to `interval_minutes` and sets interval to 15 — preview reads "every 15 minutes" (DE: "alle 15 Minuten").
- [ ] Clicking "1 h" preset while type is `interval_minutes` switches type to `interval_hours` and sets interval to 1 — preview reads "every hour" (DE: "stündlich" or equivalent).
- [ ] Preset buttons show an active highlight when the current `(scheduleType, intervalValue)` matches.
- [ ] Editing the number-input to a value that doesn't match any preset clears the active highlight.
- [ ] Preset labels render in DE/EN per locale.
- [ ] Wizard Step 5 summary renders the schedule line in the user's locale (no more "Weekly on days 1,3 at 06:00" in DE).
- [ ] `formatSchedulePreview` is exported from `schedule-builder.tsx` and used both by the builder itself and the wizard summary (single source of truth).
- [ ] `pnpm -C apps/web typecheck` clean.
- [ ] `pnpm -C apps/web build` green.
- [ ] No console warnings about unused imports or removed functions.

## Memory Bank update (mandatory — do this LAST, before pushing)

1. **`prompts/_state/STATE.md`** — Cycle 5-B entry: preset reshape (S15/S16), wizard summary localisation (S20), shared helper export. Note that the Edit-Page benefits without changes (S25).
2. **`prompts/_state/NEXT.md`** — mark S15, S16, S20, S25 as ✅ (struck through). Mark 5-B status `✅ Done`. Next cycle is 5-C (File-Handling).
3. **`prompts/_state/KNOWN_TODOS.md`** — verify the S17 deferral entry is still present (added by Claude (Chat) before this cycle). No new TODOs expected unless something surfaces during implementation.
4. Result file: `prompts/results/RESULT_5-B_SCHEDULE_BUILDER_REBUILD.md`.
5. **Notion entry status** → ✅ Ausgeführt. URL from the prompt header. Add result file path under "Ergebnis" + today's date.

## Push (mandatory final step on `develop`)

```
git push origin develop
```

`origin/develop` only — no production deploy.

## Codex review

`review:skip` — frontend-only, no data-flow / auth / backend surface. The change is mechanical (preset table reshape + i18n + function export) with no business logic touched.

## Reminders

- **Branch is `develop`.** Verify with `git rev-parse --abbrev-ref HEAD`.
- **Do not push to `main`** under any circumstances.
- The Edit-Page test path is: open `/integrations/automatic/[id]` after 5-A.5 has landed → confirm the Schedule section still renders the builder → click presets → verify they work the same as in the Wizard.
- Don't add a `useEffect` to "sync" the preset highlight — derivation from `value` is enough, and adding an effect introduces a new state-loop hazard the existing `useEffect` on `value.scheduleType` already navigates carefully.
- The renamed export (`previewSentence` → `formatSchedulePreview`) is a behaviour-preserving rename; the function body is unchanged.
- If for any reason `formatSchedulePreview` can't be exported cleanly from `schedule-builder.tsx` (circular import, etc.), the fallback is to move it to a new `apps/web/src/lib/format-schedule.ts` file and import from there in both surfaces. Try the in-place export first.
