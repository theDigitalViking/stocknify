# Cycle 5-F — Wizard UX Polish — Result

**Branch:** develop
**Review classification:** review:skip (frontend-only UX, no security/data surface)
**Date:** 2026-05-22
**Scope:** Closes S14, S19, S21 from the Batch-5 triage.

## Changes per finding

### R1 — S14: "Template verwalten" link breaks wizard

Picked the preferred approach (always-new-tab).
`apps/web/src/components/integrations/mapping-template-selector.tsx`: the existing `<Link href="/stock/import">` gained `target="_blank"` + `rel="noopener noreferrer"`. Same behaviour everywhere the selector is used — wizard, edit-page, future surfaces. The trailing `<ExternalLink>` icon already signalled "external" so no further visual change is needed. No new prop on the component, no per-call branching.

### R2 — S19: Step 5 shows mapping UUID instead of name

Picked the preferred approach (resolve via cached `useCsvMappings`).
`apps/web/src/components/integrations/setup-wizard.tsx` `Step5Summary` now calls `useCsvMappings({ direction: 'import', resourceType: 'stock' })` — same filter Step 3's `MappingTemplateSelector` uses, so the TanStack Query cache satisfies the call without a network round-trip. The resolved `mappingValue`:

- `t('mappingDefault')` when `state.mappingTemplateId === null`
- `templates.find((tpl) => tpl.id === id)?.name` when a template is selected
- raw UUID as last-resort fallback if the cached list is somehow missing the template

The existing `<SummaryRow label={t('mappingLabel')} value={state.mappingTemplateId ?? t('mappingDefault')} />` collapses to `<SummaryRow label={t('mappingLabel')} value={mappingValue} />`.

### R3 — S21: Step-jump navigation in wizard

`StepIndicator` gained an optional `onStepClick?: (step: Step) => void` prop. When set, completed steps (`stepNum < current`) render as a `<button>` with `cursor-pointer`, `hover:bg-brand-200` on the circle, `hover:text-foreground` on the label, and a native Enter/Space handler. Current step and future steps continue to render as the existing `<div>` (no hover, no click handler) — the call site cannot accidentally allow forward-jump because the click is gated inside the indicator.

`SetupWizard` passes `onStepClick={(s) => { setStep(s) }}`. No new gating in the click handler — all wizard state lives in `WizardState`, so revisiting a completed step preserves user input.

### R4 — i18n

No new keys added. The `<ExternalLink>` icon already conveys "external" visually; adding a `title` / aria-label tooltip on top of an explicit icon would be redundant noise for screen reader users.

## Files modified

- `apps/web/src/components/integrations/mapping-template-selector.tsx` — R1
- `apps/web/src/components/integrations/setup-wizard.tsx` — R2 + R3
- `prompts/_state/STATE.md` — entry + last-updated line

No new i18n keys; no schema; no backend.

## Deviations

None. All three findings used the prompt's preferred approach.

## Verification

- `pnpm -C apps/web typecheck` — clean
- `pnpm -C apps/web lint` — 0 errors, 3 pre-existing warnings on untouched files
- `pnpm -C apps/web build` — green. `/integrations/automatic` first-load JS unchanged at 256 kB; the wizard's StepIndicator branch + cached `useCsvMappings` call add no measurable JS.

## Non-goals (respected)

- No backend changes
- No schema changes
- No changes to the Edit-Page
- No forward-jump in the wizard (only backward to completed steps)
- No step validation on backward jump (state is preserved)
- No changes to the directory browser or schedule builder
