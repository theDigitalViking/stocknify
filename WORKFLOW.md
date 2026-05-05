# Stocknify — Vibe-Coding Workflow

> The single source of truth for how cycles run. Read at the start of every Claude Code prompt; always overrides any conflicting habit.

---

## The unit of work: one cycle

A **cycle** is one focused unit of change — typically a single feature, fix, or refactor that maps to one Notion entry, one prompt file, one result file, and one push.

**One Claude.ai chat = one cycle.** When a cycle ends (pushed + reviewed), the chat closes. The next cycle opens a fresh chat. This is the only reliable defense against context degradation in long Claude.ai sessions.

---

## Bootstrap prompt for Claude (Chat)

At the start of a new Claude.ai chat, paste this single sentence:

```
Stocknify-Cycle. Lies `WORKFLOW.md`, `prompts/_state/STATE.md` und `prompts/_state/NEXT.md` via Filesystem MCP, dann reden wir über den nächsten Cycle.
```

Claude (Chat) reads the memory bank itself — no copy-paste of file contents needed. Sebastian only sends the trigger; everything else is automatic. The trigger is German because conversation with Sebastian is German; file content stays English.

---

## Bootstrap prompt for Claude Code

At the start of every Claude Code session, paste this prompt with `<NAME>` replaced by the current prompt's filename (without the `.md` extension and without the `PROMPT_` prefix is fine — full path also works):

```
You're running a Stocknify cycle. Before doing anything else:

0. Branch check. Verify you're on `develop`: `git rev-parse --abbrev-ref HEAD`. If you're on `main` or another branch, run `git checkout develop` (or `git checkout -b develop` if it doesn't exist locally yet — but it should). All cycle commits land on `develop`. Never commit or push to `main`.
1. Review gate. Run `/codex:setup --enable-review-gate` so Codex automatically reviews before you finish. If the command fails or the plugin is unavailable, note it and continue — Sebastian will run the review manually.
2. Carry-over commit. Run `git status --porcelain`. If there are uncommitted changes in any of these whitelisted paths — `prompts/_state/`, `prompts/PROMPT_*.md`, `prompts/results/`, `WORKFLOW.md`, `PROJECT.md` — stage and commit ONLY those paths with the message `chore(memory-bank): carry over updates from prior chat session`. Do NOT touch other uncommitted paths (`.gitignore`, `test-data/`, anything outside the whitelist). If the whitelist is empty, skip this step silently. See WORKFLOW.md § Carry-over commits.
3. Read `WORKFLOW.md` (this file)
4. Read `prompts/_state/STATE.md`
5. Read `prompts/_state/NEXT.md`
6. Read `prompts/_state/DECISIONS.md`
7. Read `prompts/_state/KNOWN_TODOS.md`

Then execute `prompts/PROMPT_<NAME>.md` exactly as specified. The "Memory Bank update" section at the end of that prompt is mandatory and must be completed before you push. After the Memory Bank update is committed and the Codex review gate has passed (or been skipped with Sebastian's approval), run `git push origin develop`. Never push to `main` — that is Sebastian's manual merge step.
```

Claude (Chat) hands this prompt over with the filename pre-filled at the start of every cycle, so Sebastian never has to remember it. The bootstrap stays the same for frontend, backend, or any other type of cycle — file-specific context lives inside the referenced PROMPT file, not in the bootstrap.

**Effort-level recommendation:** Claude (Chat) always includes a recommended effort level when handing over the bootstrap prompt. Sebastian sets the level before pasting the prompt:

```
/effort <level>
```

The recommendation follows these guidelines (assuming Opus 4.7 where `xhigh` is the default):

| Level | When to recommend |
|-------|-------------------|
| `medium` | Trivial single-file fixes, doc-only cycles, pure renames, simple i18n additions |
| `high` | Frontend-only refactors with very clear specs, no data-flow changes, no ambiguity |
| `xhigh` | **Default — leave as-is.** Mixed backend+frontend cycles, new endpoints, behaviour changes, diagnostic/infra work, anything with data-flow logic or RLS/security surface |
| `max` | Reserved for genuinely hard problems: large L-estimate cycles with algorithmic complexity, multi-system debugging, critical architecture decisions |

The effort level controls Claude Code's thinking budget — how deeply it reasons before acting. Lower effort is faster and cheaper; higher effort catches more edge cases but costs more tokens. In most cases, leaving the default (`xhigh`) is correct. The recommendation is a guideline, not a hard rule — Sebastian can override based on feel.

**Formatting rule for Claude (Chat):** when handing copy-paste content to Sebastian in chat — bootstrap prompts, shell commands, snippets, anything he needs to extract verbatim — always render it as a fenced code block (```` ``` ````) or inline code, never as a Markdown blockquote (`>`). Blockquotes are painful to copy on both mobile and desktop because the leading marker and indentation get selected with the text. This applies to all Stocknify chat sessions.

---

## The seven steps

### 1. Read state
At the start of a cycle, Claude (Chat) reads:
- `prompts/_state/STATE.md` — what is the project doing right now?
- `prompts/_state/NEXT.md` — what's next?
- `prompts/_state/DECISIONS.md` — only if the cycle touches a decided area.
- `prompts/_state/KNOWN_TODOS.md` — only if the cycle could resolve or interact with a known TODO.

These four files are deliberately small. Re-load as needed; do not summarize.

### 2. Notion entry + prompt file
Claude (Chat) creates the Notion entry in the **Prompts & AI Sessions** database with status `🚧 In Arbeit`, then writes `prompts/PROMPT_<name>.md` **directly into the repo** via Filesystem MCP. No manual copying by Sebastian.

### 3. Run + commit (on `develop`)
Claude Code reads the prompt and executes. Commits land on `develop` (see Branching strategy below). Commit messages clear and conventional. Does **not** push yet — Codex review (step 5) and Memory Bank update (step 4) come first.

### 4. Update memory bank + Notion (mandatory, in the same run)
At the end of every Claude Code run, before pushing:
- Update `prompts/_state/STATE.md` to reflect what changed.
- Append to `prompts/_state/KNOWN_TODOS.md` if anything was deferred.
- Write `prompts/results/RESULT_<name>.md` from the result template.
- Set the Notion entry status to ✅ Ausgeführt and link the result file in the "Ergebnis" property.

This is non-negotiable. Without these steps, state drifts and the next session starts blind. Sebastian never updates Notion or memory bank files manually.

### 5. Codex adversarial review (automatic via review gate)
The Codex plugin's **review gate** is enabled at the start of every Claude Code session (`/codex:setup --enable-review-gate`). It runs automatically before Claude Code finishes a run — no manual slash command needed. If the review finds issues, the run is blocked so Claude Code can address them first.

**Important:** The review gate can create long-running Claude/Codex loops. Only use it in sessions you actively monitor (which is all Stocknify sessions — Sebastian is always present).

**If the review gate hangs or loops:** press `Esc` to abort, then run the review manually:

```
/codex:adversarial-review --base origin/develop --wait
```

Findings are classified by Claude Code following the policy in DECISIONS 2026-04-16:
- **Security / Data Integrity / Correctness** → fix in another commit, possibly another round. Do not push until clean.
- **Hypothetical / MVP-irrelevant / deployment ergonomics** → append to `KNOWN_TODOS.md`, proceed to push.

The review gate is the quality gate for the push to `develop`. Pure documentation cycles skip this step (no security/correctness surface).

### 6. Push (`develop` → no production deploy)
Claude Code runs `git push origin develop` after the Memory Bank update is committed and Codex review (if applicable) is clean. This pushes to `origin/develop`:
- **CI runs** (typecheck, lint, test, build) — safety net before any merge.
- **Vercel auto-creates a Preview Deployment** for the `develop` branch with a stable URL. Use this to review frontend state.
- **No production deploy** is triggered. Production deploys only happen on `main` (see Branching strategy).

The production-deploy gate is Sebastian's manual `develop` → `main` merge, not the per-cycle push.

### 7. Chat close
Chat closes. The next cycle opens a fresh chat.

---

## Carry-over commits

Between cycles, Claude (Chat) updates memory-bank files (most often `NEXT.md`, sometimes `STATE.md` / `DECISIONS.md` / `WORKFLOW.md` / `PROJECT.md`) directly via Filesystem MCP. Claude (Chat) cannot push, so those updates land as uncommitted changes in Sebastian's working tree.

To prevent these from accumulating or forcing Sebastian to commit by hand, every Claude Code cycle starts with a **carry-over commit**: a single chore-commit that picks up only the whitelisted memory-bank paths and lands them on `develop` before the cycle's actual work begins.

**Whitelist (only these paths are eligible for carry-over):**

- `prompts/_state/` — STATE, NEXT, DECISIONS, KNOWN_TODOS
- `prompts/PROMPT_*.md` — new prompt files written by Claude (Chat)
- `prompts/results/` — result files (rare for Chat, but possible)
- `WORKFLOW.md`
- `PROJECT.md`

**Anything outside the whitelist is left alone** — that includes `.gitignore`, `test-data/`, untracked directories, code edits, anything Sebastian might have in flight. The whitelist is intentionally narrow so a forgotten WIP can never accidentally ride along.

**Commit message is fixed:** `chore(memory-bank): carry over updates from prior chat session`. One commit per cycle start, regardless of how many files. If multiple cycles' worth of carry-over has accumulated (shouldn't happen, but safe-by-default), they still collapse into one commit.

**If the whitelist is empty**, the step is a no-op and is skipped silently — no empty commit, no log noise.

The carry-over commit pushes alongside the cycle's own commits at the end of the cycle, in the same `git push origin develop`.

---

## Hard rules

- **Claude (Chat) never edits production code.** Only prompts, results, memory bank files, and (when explicitly authorized) workflow/template documentation.
- **Claude Code commits and pushes on `develop`, never on `main`.** Hotfixes are out-of-band and explicitly handled by Sebastian (see Branching strategy).
- **Claude Code pushes `develop` itself** at the end of a cycle, after the Memory Bank update is committed and Codex review (if applicable) is clean. The per-push manual handoff is gone; the production gate is Sebastian's `develop` → `main` merge.
- **Claude Code never merges `develop` into `main`.** That decision is Sebastian's, made when the accumulated develop state is review-ready.
- **One cycle, one chat.** No exceptions.
- **STATE.md is updated by Claude Code at the end of every run.** This is what keeps the memory bank alive.
- **Notion status is updated by Claude Code (or Claude Chat as fallback), never by Sebastian manually.**
- **Communication with Sebastian = German. All files for coding agents = English.**
- **Notion titles never use icons.** Property values may.

---

## Branching strategy

Two long-lived branches:

- **`develop`** — the working line. Every cycle commits and pushes here. Pushing `develop` runs CI and produces a Vercel Preview Deployment, but does **not** trigger production deploy.
- **`main`** — production. Every commit on `main` triggers the production deploy pipeline (`.github/workflows/deploy.yml`), gated by manual approval in the GitHub `production` environment.

### Merge cadence: batch, not per-cycle

Cycles are planned in batches (e.g. "Cycles A–E from the frontend triage"). The merge to `main` happens **after all cycles in the current batch are complete**, not after each individual cycle. The rhythm is:

1. **Plan** — Claude (Chat) + Sebastian define a batch of cycles (scope, order, estimates).
2. **Execute** — cycles run sequentially on `develop`, one chat per cycle. Claude Code pushes after each.
3. **Review** — after the last cycle in the batch, Sebastian reviews the accumulated `develop` state via Vercel Preview + local `pnpm dev`. Bug-fix cycles may be added at this stage.
4. **Merge** — Sebastian merges `develop` into `main` (`git checkout main && git merge develop --ff-only && git push`).
5. **Deploy** — production deploy runs through its approval gate. Frontend → Vercel production, API → Hetzner via Kamal.
6. **Next batch** — new planning round starts.

This keeps the review surface manageable (one coherent chunk of related changes) and avoids partially-shipped feature sets on production.

Backend caveat: there is **no backend preview environment**. Hetzner/Kamal only deploys from `main`. Frontend changes on `develop` can be reviewed against the existing production API as long as no breaking API-contract changes are pending. For full-stack cycles where backend changes matter for the review, fall back to local testing (`pnpm dev`) before merging.

Hotfix flow (rare): if a critical fix needs to bypass `develop`, Sebastian commits directly on `main` out-of-band, then immediately rebases or merges `main` back into `develop` to keep the branches in sync. Claude Code does not perform this — it's a manual operator action only.

Future branches (release/hotfix branches) are not in scope. If they're added, this section is the place that gets revised.

---

## Pre-flight policy (transitional)

Until the memory bank reflects reality reliably (target: first 5–10 cycles after initialization), every PROMPT file includes a **Pre-flight check** section. Claude Code must verify whether the prompted feature already exists before implementing it — because at the start of the memory-bank era we cannot fully trust that STATE.md captures every cycle that ran during the chat-handover days.

The pre-flight check is removed from new prompts when:

- STATE.md has been continuously up to date for 5+ consecutive cycles, **and**
- No cycle in that window discovered a feature that was already partially or fully implemented.

When those conditions hold, Claude (Chat) drops the section from `prompts/_templates/PROMPT_TEMPLATE.md` and notes the change in DECISIONS.md.

---

## File layout

```
PROJECT.md                          ← static architecture, single source of truth
WORKFLOW.md                         ← this file
prompts/
├── _state/                         ← live memory bank
│   ├── STATE.md
│   ├── NEXT.md
│   ├── DECISIONS.md
│   └── KNOWN_TODOS.md
├── _templates/                     ← prompt + result skeletons (canonical)
│   ├── PROMPT_TEMPLATE.md
│   └── RESULT_TEMPLATE.md
├── PROMPT_<name>.md                ← active prompts
├── results/
│   └── RESULT_<name>.md            ← completed result files
├── TEMPLATE_RESULT.md              ← legacy template, kept for reference
├── TEMPLATE_CODEX_REVIEW.md        ← legacy
├── TEMPLATE_REVIEW_RESULT.md       ← legacy
└── CODING_GUIDELINES.md            ← project-wide coding conventions
```

---

## Notion structure

- **📝 Prompts & AI Sessions** (data source `a5045d80-7579-4bfe-9fac-783f7b1c39a7`) — every cycle gets one entry.
- **🗂️ Projektplan & Roadmap** (data source `f48883d0-...`) — Kanban tasks, linked from prompts via the `Tasks` relation.
- Property names in Prompts DB: `Prompt` (title), `Status`, `Phase`, `Bereich` (multi-select), `Typ`, `Agent`, `Dateiname`, `Ausgeführt am` (date), `Ergebnis` (text).
- Notion titles never use icons in the title text itself.
