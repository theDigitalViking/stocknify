# Review Result: 2-B Movements-Chart Polish

> Two Codex adversarial-review passes were run for this cycle:
> - **Pass 1** — `/codex:adversarial-review` (default working-tree scope) — caught only unrelated workflow-doc churn; both findings deferred (governance, not code).
> - **Pass 2** — `/codex:adversarial-review --base origin/main` — caught the cycle's actual code; **two ACTIONABLE findings, both fixed in commit `83ae51f`**.
> Reviewed at: 2026-05-05
> Final cycle disposition: **2 findings fixed, 2 findings deferred (governance/process).**

---

## Summary

Codex reviewed the **working-tree diff**, which at review time contained only the two workflow-doc files modified by Claude Chat via Filesystem MCP during the cycle (WORKFLOW.md + prompts/_templates/PROMPT_TEMPLATE.md). The actual Cycle 2-B feature commits (`1794d1a` — chart polish + range picker) were already on `origin/develop` and outside Codex's scope. Both findings flag the workflow's removal of the pre-push Codex gate — a deliberate, documented decision (DECISIONS 2026-05-05 — "Codex review decoupled from Claude Code plugin"). Neither finding concerns Cycle 2-B's frontend changes; neither falls under Security / Data Integrity / Correctness in the code sense. Per the findings policy (DECISIONS 2026-04-16), both are documented and deferred.

---

## Scope mismatch (methodological observation)

The bare `/codex:adversarial-review` invocation defaults to working-tree scope. After the cycle's feature + memory-bank commits had already landed and pushed, the working tree carried only the unrelated workflow-doc churn from Claude Chat. As a result, Codex did not see `apps/web/src/app/(dashboard)/stock/movements/page.tsx`, `apps/web/src/components/stock/stock-movement-chart.tsx`, the i18n updates, or the result/state files written this cycle.

**Implication for future cycles:** when running adversarial review *after* the cycle commits have landed, invoke with an explicit base ref so the cycle's feature work is in scope. Suggested invocation:

```
/codex:adversarial-review --base origin/main
```

(or `--base HEAD~3` calibrated to the cycle's commit count). The current cycle's review effectively covers the workflow-doc decision — not the code that shipped.

---

## Findings

### [high] Pre-push review gate was removed, making adversarial review non-blocking

- **File:** `prompts/_templates/PROMPT_TEMPLATE.md` (working-tree, lines ~56-70)
- **Codex's claim:** The template now instructs `git push origin develop` immediately after memory-bank updates and explicitly moves Codex review to a separate step after push. Risky changes can land on `develop` (and trigger CI/preview) before security/data-integrity/correctness issues surface.
- **Classification:** **DEFERRED — governance/process, not code.**
- **Reasoning:**
  - This is the explicit, documented behavior of DECISIONS 2026-05-05 ("Codex review decoupled from Claude Code plugin"). The gate was removed because the `codex-companion` plugin was intermittently hanging, blocking sessions, and triggering stale `codex:rescue` loops. The instability of the gate outweighed its blocking value.
  - The production-deploy gate is preserved: Sebastian's manual `develop` → `main` merge. `develop` push only triggers CI + Vercel Preview, neither of which affect production. The "shared integration branch" risk Codex raises is real but bounded by the merge gate — unreviewed code on `develop` cannot reach production without Sebastian's deliberate merge.
  - For `review:mandatory` cycles (auth, schema, RLS, API contracts, data-flow), Sebastian still runs Codex out-of-band before merging. Cycle 2-B is `review:recommended` (frontend-only, no backend touch) — exactly the class of cycle where the trade-off is most clearly net-positive.
  - The "automated GitHub Action that runs Codex on push to develop for review:mandatory cycles" is already noted as planned future work (WORKFLOW.md § Step 6). That's the right fix for the residual concern — not reverting the recent decision.
- **Action taken:** None. Recorded in KNOWN_TODOS under Workflow with cross-reference to DECISIONS 2026-05-05.

### [medium] Workflow now allows push-before-review while still treating fixes as same-cycle follow-up

- **File:** `WORKFLOW.md` (working-tree, lines ~164-168)
- **Codex's claim:** Cycle is "considered pushed" before mandatory review is resolved; subsequent fix commits are unplanned hot follow-ups, increasing partial-remediation risk.
- **Classification:** **DEFERRED — governance/process, not code.**
- **Reasoning:**
  - Same root as the [high] finding above — both flag the same decoupling decision from different angles.
  - Cycle completion is intentionally redefined: "cycle ends at push" is the new contract. Review-driven fix commits are explicitly modeled as a follow-up (e.g. `2-FIX` cycle) per DECISIONS 2026-04-16's classification: Security/Data Integrity/Correctness → fix cycle; everything else → KNOWN_TODOS. The "ambiguity" Codex describes is in fact the deliberate model.
  - The branch-protection / required-status-check Codex recommends is the same automation already noted as planned future work.
- **Action taken:** None. Same KNOWN_TODOS entry as above.

---

## Findings classification table

| # | Severity | Domain | Classification | Action |
|---|----------|--------|----------------|--------|
| 1 | high | Workflow governance (PROMPT_TEMPLATE.md) | DEFERRED — governance/process, not code; argues against documented decision (DECISIONS 2026-05-05) | None; KNOWN_TODOS entry added |
| 2 | medium | Workflow governance (WORKFLOW.md) | DEFERRED — same root as finding 1 | None; same KNOWN_TODOS entry |

---

## No Issues Found In

Codex did not review the Cycle 2-B feature commits (scope mismatch — see above). The cycle's actual surface (`stock-movement-chart.tsx`, `movements/page.tsx`, the i18n keys, the result/state files) was not exercised by this review and carries no Codex finding either way. If a real adversarial pass on the chart polish is wanted, a fresh `/codex:adversarial-review --base origin/main` (or a targeted re-run on the Cycle 2-B commit range) would land it.

---

## KNOWN_TODOS.md additions

A new "Workflow" section captures the deferred governance findings, with explicit cross-references so a future operator (or a re-running Codex) does not re-open the same conversation:

- **Pre-push Codex gate is intentionally absent** (DECISIONS 2026-05-05). The `codex-companion` plugin's instability — intermittent hangs, blocking `codex:rescue` loops, and session-killing failure modes — outweighed the gate's blocking value. Not a regression; current model is documented and intentional. If pre-push enforcement is desired, the path is the planned GitHub Action that runs Codex on push to `develop` for `review:mandatory` cycles — not reverting the decoupling. Tracked as a "Future automation" item in WORKFLOW.md § Step 6; surface again here for visibility.

---

## Recommended Next Steps

For Cycle 2-B itself: none — both findings are deferred per policy.

For workflow tooling (separate cycle, when prioritized):

1. **Implement the planned GitHub Action** that runs Codex adversarial review on push to `develop`, gated by the `review:mandatory` classification in the prompt header. Findings posted as a CI artifact; mandatory-class cycles cannot merge to `main` without a clean review.
2. **Default `/codex:adversarial-review` invocation in WORKFLOW.md** — recommend an explicit base ref (`--base origin/main` after a push, or `--base HEAD~N`) when the cycle's commits have already landed. The bare-args form silently scopes to working tree, which is empty (or full of unrelated churn) post-push.

---

## Memory Bank updates (Pass 1 — governance findings)

- [x] This review file written.
- [x] `KNOWN_TODOS.md` — new "Workflow" entry capturing the deferred governance findings + cross-reference to DECISIONS 2026-05-05.
- [x] `STATE.md` — review-disposition note appended under the Cycle 2-B entry; Last-updated bumped.

---

# Pass 2 — `/codex:adversarial-review --base origin/main`

After Pass 1's scope-mismatch finding was processed, the review was re-run with an explicit base ref so Codex could see the cycle's actual feature code (chart polish + range picker). Two fresh findings, both about the just-shipped code.

## Pass 2 Summary

- [high] Chart silently truncated to first 200 oldest movements in the selected range (`movements/page.tsx:167-169`).
- [medium] Range state initialized from URL once at mount but never re-synced; browser back/forward + on-page navigation could leave queries running on stale `from`/`to` while the address bar shows different values (`movements/page.tsx:83-91`).

Both fall under **Correctness / Data Integrity in view** — operator-visible defects that affect the data shown on the page. Per the findings policy (DECISIONS 2026-04-16), both ACTIONABLE.

## Pass 2 Findings & disposition

### [high] Chart silently truncates movement history to first 200 oldest points — FIXED

- **File:** `apps/web/src/app/(dashboard)/stock/movements/page.tsx:167-169`
- **Codex's claim:** `chartFilters` hard-limits to `perPage: 200` with `sortDir: 'asc'`. With more than 200 movements in the selected range, the UI shows the EARLIEST 200 records and silently drops everything more recent. Operators see an apparently valid trend that excludes the latest activity, with no warning.
- **Classification:** ACTIONABLE — Correctness / Data Integrity in view.
- **Fix (commit `83ae51f`):**
  1. Flipped `chartFilters.sortDir` from `'asc'` to `'desc'`. The API now returns the LATEST 200 movements in the range. The chart component already sorts ascending internally before rendering (left-to-right time order is preserved), so this is a server-query change, not a chart-logic change.
  2. Compute `isChartTruncated = chartTotal > chartRows.length` from the `meta.total` already returned by `apiFetchWithMeta`. When true, render a small amber `<p role="status">` notice above the chart: "Showing the latest {shown} of {total} movements in this range. Narrow the time range for the full series." (en + de). New i18n key `stockMovements.chart.truncatedNotice` with `{shown}` / `{total}` ICU placeholders.
- **Why this approach over Codex's "unpaginated chart endpoint" alternative:** Codex offered two options — (a) dedicated unpaginated endpoint/stream for the chart, or (b) latest-window + truncation indicator. Option (a) is a backend change and inflates per-request payloads for high-throughput tenants without solving the bigger render-density problem. Option (b) is a frontend-only fix that converts a silent failure into a visible one immediately, while leaving the long-term server-side downsampling work (already tracked in KNOWN_TODOS as "stock_movements chart aggregation/downsampling") as the right destination when a tenant reports the cap is biting in real use. Per DECISIONS 2026-04-16, MVP scale doesn't warrant the bigger rebuild yet.

### [medium] Range state decoupled from URL after initial render — FIXED

- **File:** `apps/web/src/app/(dashboard)/stock/movements/page.tsx:83-91`
- **Codex's claim:** `range` is initialized from `search` once via `useState`, then becomes pure local state. If URL query params change while the user stays on the page (browser back/forward, deep-link route updates), queries run with stale `from`/`to` values while the address bar shows different ones. Bad for shared URLs and incident reproduction.
- **Classification:** ACTIONABLE — Correctness.
- **Fix (commit `83ae51f`):** Three coordinated changes:
  1. **`defaultRangeRef`** — a `useRef` holding the mount-time 30d ISOs. Without it, the sync effect's URL-empty branch would recompute `subDays(now, 30)` on each fire, producing ISOs that drift by milliseconds and triggering needless TanStack Query refetches.
  2. **Mount-writer effect** — runs once on mount; if the URL has neither `from` nor `to`, calls `writeRangeToUrl` with the default 30d ISOs. After this fires, the URL is **always** the single source of truth for the active range — no more URL-empty-vs-state asymmetry. This intentionally changes the prior "URL stays clean for the default" behavior; the asymmetry was the root of the desync.
  3. **Sync effect** — keyed on `search`, runs on every URL change (including our own writes). The equality short-circuit (`prev.from === urlFrom && prev.to === urlTo`) makes our own writes no-ops; the URL-empty branch resets to the stable `defaultRangeRef.current`; everything else updates `range` to match the URL and clears `activePreset` (since we cannot tell from a URL alone which preset, if any, was active — URL→preset rehydration stays a tracked TODO).
- **Behavioral consequence (intentional):** A fresh load on `/stock/movements` now always lands on `?from=…&to=…` rather than a clean URL. That's the correct trade for a filter that materially shapes the data the operator sees: shareable URLs always mean what they appear to mean, browser back/forward never desyncs from rendered data, and the previous "URL→preset rehydration on load = future TODO" entry in KNOWN_TODOS is unchanged.

## Pass 2 Findings classification table

| # | Severity | File | Domain | Classification | Action |
|---|----------|------|--------|----------------|--------|
| 3 | high | `movements/page.tsx:167-169` | Correctness — chart silent truncation | ACTIONABLE | Fixed in `83ae51f` (desc + meta.total notice + i18n) |
| 4 | medium | `movements/page.tsx:83-91` | Correctness — URL/state desync | ACTIONABLE | Fixed in `83ae51f` (defaultRef + mount-writer + sync effect) |

## Codex's reasoning notes (observed but not elevated)

Codex's chain-of-thought mentioned a few additional observations that did **not** make the final findings list. Recorded here for transparency; no action taken:

- **Possible 31-vs-30-day count for the 30d preset.** `subDays(startOfDay(now), 30)` to `endOfDay(now)` covers ~30 calendar days inclusive of today's partial day. This is the standard "Last N days" semantic. Not actionable.
- **`apiFetch` may set `Content-Type: application/json` on FormData bodies.** Possible but no current caller sends FormData via `apiFetch`. Existing CSV uploads use a separate path. If a future caller adds FormData to `apiFetch`, the helper should be hardened then; not a Cycle 2-B regression.
- **`new Date(iso)` in `isoToDateInput` could shift display in negative TZs when URL was created externally with UTC midnight.** Acknowledged in the original RESULT_2-B "Key decisions" — operators in different TZs sharing the same URL see slightly different boundaries. Not a Cycle 2-B regression; same trade-off as before. The mount-writer fix actually narrows this surface because URLs are now always operator-local-day-anchored on creation.
- **`<input type="date">` UI prevents invalid dates like `2026-02-31`, but a manually edited URL could carry one and `new Date(y, m-1, d)` would normalize.** Edge case; bounded to manual URL edits. Not actionable here.

## Memory Bank updates (Pass 2 — code findings)

- [x] Both findings fixed in commit `83ae51f`.
- [x] This review file extended with the Pass 2 section.
- [x] `STATE.md` — added Cycle 2-B-FIX entry; Last-updated bumped.
- [x] `KNOWN_TODOS.md` — note added under Frontend referencing the truncation-notice as the explicit user-facing signal that supersedes the older "downsampling" item's silent-truncation concern (the long-term downsampling work itself remains tracked).
