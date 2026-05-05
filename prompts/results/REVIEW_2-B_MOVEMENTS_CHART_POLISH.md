# Review Result: 2-B Movements-Chart Polish

> Written by Codex via `/codex:adversarial-review` (working-tree scope, no flags)
> Reviewed at: 2026-05-05
> Verdict: needs-attention (per Codex)
> Cycle disposition: **all findings deferred** — both target a deliberate workflow decision, not Cycle 2-B's code.

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

## Memory Bank updates

- [x] This review file written.
- [x] `KNOWN_TODOS.md` — new "Workflow" entry capturing the deferred governance findings + cross-reference to DECISIONS 2026-05-05.
- [x] `STATE.md` — review-disposition note appended under the Cycle 2-B entry; Last-updated bumped.
