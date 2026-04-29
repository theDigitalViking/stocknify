# PROMPT: <Short title — what this cycle does>

**Phase:** <Phase 1-6 | Übergreifend>
**Area:** <Backend | Frontend | Infrastructure | Integrations | Rule Engine | Notifications | Billing | Schema | Security>
**Type:** <Feature | Fix | Add-on | Review>
**Notion:** <URL of the Notion entry created by Claude (Chat)>

---

## Context

<Why this cycle exists. What problem it solves. Link to the trigger — a user-reported issue, a follow-up from a previous cycle, a planned milestone. 2-4 sentences.>

## Non-goals

<Explicit list of things NOT in scope. Critical for keeping cycles small. Anything tempting to expand into goes here.>

## Files involved

<List of files to read or modify. Use repo-relative paths. If unsure of exact path, describe and let Claude Code resolve.>

## Pre-flight check (mandatory — do this FIRST, before writing any code)

> **TRANSITIONAL** — this section stays in every prompt until the memory bank has stabilized (likely the first 5–10 cycles after Memory Bank initialization). Sebastian or Claude (Chat) will signal when it can be removed. See WORKFLOW.md § Pre-flight policy.

Before implementing anything, verify whether the feature in this prompt may already exist in the repo. Cycles in this project have sometimes overlapped and the historical handover may be incomplete.

1. **Look in the obvious places.** For each file under "Files involved", grep for symbols, props, routes, or i18n keys this prompt would add. Check the most recent ~20 entries in `prompts/results/` (sorted by mtime) for anything touching the same area. Skim `git log --oneline -30`.
2. **Classify.**
   - **Already done:** the feature is implemented and matches this prompt's intent. → Stop. Write `prompts/results/RESULT_<name>.md` noting "already implemented; no changes needed", point at the existing files, set the Notion entry to ✅ Ausgeführt with a one-line `Ergebnis` like *"Pre-flight: feature already present, no commit"*. Do **not** commit, do **not** push. Update STATE.md if the existing implementation isn't reflected there.
   - **Partially done:** some items in this prompt's Requirements list are already in the repo. → Implement only the missing items. In the result file, list which were already done (with file pointers) and which you implemented.
   - **Not done:** proceed normally with Requirements below.
3. **When uncertain**, default to flagging in the result file rather than building. Write what you found and propose a plan; do not silently overwrite.

## Requirements

<Numbered list. Each requirement is a verifiable statement. Avoid vague directives like "make it nice" — every requirement should map to a checkable acceptance criterion below.>

## Acceptance Criteria

- [ ] <Concrete, checkable item>
- [ ] <...>
- [ ] `pnpm -C apps/api typecheck` passes (if backend touched)
- [ ] `pnpm -C apps/web typecheck` passes (if frontend touched)
- [ ] All relevant tests pass

## Memory Bank update (mandatory — do this LAST, before pushing)

After commit, in the same commit or a follow-up commit, update the memory bank:

1. **`prompts/_state/STATE.md`** — under "What's in flight" or "What's deployed and working", reflect what this cycle did. Update "Last updated" date. Move resolved items out of "in flight".
2. **`prompts/_state/KNOWN_TODOS.md`** — append any deferred Codex findings or known limitations introduced by this cycle. Update "Last updated" date.
3. Result file: `prompts/results/RESULT_<same-name-as-this-prompt>.md` following `prompts/_templates/RESULT_TEMPLATE.md`.
4. **Notion entry status** → ✅ Ausgeführt. Use the Notion URL from the prompt header. Add the result file path under the "Ergebnis" property and tick "Ausgeführt am" with today's date. If the Notion MCP is not available, leave a note in the result file under "Skipped or deferred" requesting Sebastian or Claude (Chat) to do it manually.

## Push (mandatory final step on `develop`)

After the Memory Bank update is committed and Codex review (if part of this cycle) is clean:

```
git push origin develop
```

This pushes to `origin/develop` only. CI runs and a Vercel Preview Deployment is created; **no production deploy** is triggered. Production deploy is gated on Sebastian's manual `develop` → `main` merge.

**Never push to `main`.** That branch is Sebastian's manual merge target.

## Reminders

- **Branch is `develop`.** Verify with `git rev-parse --abbrev-ref HEAD` before committing.
- **Do not push to `main`** under any circumstances. Hotfix flow is out-of-band, Sebastian-only.
- If a Codex review is part of this cycle, run it via `/codex:adversarial-review --base origin/develop [focus]` **before** the push. Classify findings: Security / Data Integrity / Correctness → fix and re-review. Hypothetical / MVP-irrelevant → log in `KNOWN_TODOS.md`, then push.
- Pure documentation cycles skip Codex review (no security/correctness surface) but still push to `develop`.
