# Stocknify — Vibe-Coding Workflow

> The single source of truth for how cycles run. Read at the start of every Claude Code prompt; always overrides any conflicting habit.

---

## The unit of work: one cycle

A **cycle** is one focused unit of change — typically a single feature, fix, or refactor that maps to one Notion entry, one prompt file, one result file, and one push.

**One Claude.ai chat = one cycle.** When a cycle ends (pushed + reviewed), the chat closes. The next cycle opens a fresh chat. This is the only reliable defense against context degradation in long Claude.ai sessions.

---

## Bootstrap prompt for Claude Code

At the start of every Claude Code session, paste this prompt with `<NAME>` replaced by the current prompt's filename (without the `.md` extension and without the `PROMPT_` prefix is fine — full path also works):

> You're running a Stocknify cycle. Read these in order before doing anything else:
>
> 1. `WORKFLOW.md` (this file)
> 2. `prompts/_state/STATE.md`
> 3. `prompts/_state/NEXT.md`
> 4. `prompts/_state/DECISIONS.md`
> 5. `prompts/_state/KNOWN_TODOS.md`
>
> Then execute `prompts/PROMPT_<NAME>.md` exactly as specified. The "Memory Bank update" section at the end of that prompt is mandatory and must be completed before you stop. Do not `git push` — that's Sebastian's manual step.

Claude (Chat) hands this prompt over with the filename pre-filled at the start of every cycle, so Sebastian never has to remember it. The bootstrap stays the same for frontend, backend, or any other type of cycle — file-specific context lives inside the referenced PROMPT file, not in the bootstrap.

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

### 3. Run + commit
Claude Code reads the prompt and executes. Commits with a clear message. **Never runs `git push`.**

### 4. Update memory bank + Notion (mandatory, in the same run)
At the end of every Claude Code run, before stopping:
- Update `prompts/_state/STATE.md` to reflect what changed.
- Append to `prompts/_state/KNOWN_TODOS.md` if anything was deferred.
- Write `prompts/results/RESULT_<name>.md` from the result template.
- Set the Notion entry status to ✅ Ausgeführt and link the result file in the "Ergebnis" property.

This is non-negotiable. Without these steps, state drifts and the next session starts blind. Sebastian never updates Notion or memory bank files manually.

### 5. Codex adversarial review (when applicable)
For non-trivial cycles, after commit:

```
/codex:adversarial-review --base HEAD~1 [focus text]
```

Findings are classified by Claude (Chat):
- **Security / Data Integrity / Correctness** → fix in another commit, possibly another Codex round.
- **Hypothetical / MVP-irrelevant / deployment ergonomics** → append to `KNOWN_TODOS.md`, stop.

### 6. Push
Sebastian runs `git push` manually. CI/CD auto-deploys to staging then production.

### 7. Chat close
Chat closes. The next cycle opens a fresh chat.

---

## Hard rules

- **Claude (Chat) never edits production code.** Only prompts, results, and memory bank files.
- **Claude Code never `git push`.** Sebastian pushes manually.
- **One cycle, one chat.** No exceptions.
- **STATE.md is updated by Claude Code at the end of every run.** This is what keeps the memory bank alive.
- **Notion status is updated by Claude Code (or Claude Chat as fallback), never by Sebastian manually.**
- **Communication with Sebastian = German. All files for coding agents = English.**
- **Notion titles never use icons.** Property values may.

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
