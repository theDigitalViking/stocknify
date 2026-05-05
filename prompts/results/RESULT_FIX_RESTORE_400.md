# RESULT: Fix — Restore gibt 400 statt Erfolg

**Prompt:** `prompts/PROMPT_FIX_RESTORE_400.md`
**Notion:** https://www.notion.so/35724fe1d88a811abdefc8651dd1a6b2
**Branch:** develop
**Last commit:** `c07f809` — `fix(web): drop Content-Type on body-less requests to avoid 400 on POST /products/:id/restore`
**Date:** 2026-05-05

---

## Summary

Restore button now succeeds. The 400 came from `apiFetch` always setting `Content-Type: application/json`, even on body-less requests; Fastify's default JSON parser then rejected the empty body with `FST_ERR_CTP_EMPTY_JSON_BODY`. The two web fetch helpers now only advertise the JSON content type when `options.body` is defined.

## Files changed

- `apps/web/src/lib/api/client.ts` — `apiFetch` and `apiFetchWithMeta` now derive `hasBody = options?.body !== undefined && options.body !== null` and only spread `'Content-Type': 'application/json'` into the headers when `hasBody` is true. Comment on `apiFetch` records the Fastify failure mode so this won't be re-introduced. Backend route handler, the restore mutation hook (`useRestoreProduct`), and the `RestoreProductDialog` component are unchanged — the bug was strictly in the request shape, not in any caller.

## Key decisions made during execution

- **Fix lives in `apiFetch`, not in `useRestoreProduct`.** The narrow alternative was to send `body: JSON.stringify({})` from the restore mutation. That would have worked for the one observed call but left the same trap for every future body-less POST/PUT/PATCH. The general fix in the fetch helpers is the same number of lines and aligns with HTTP semantics (don't advertise a content type when there's no content). It also fixed `apiFetchWithMeta` symmetrically.
- **Backend route + tests not touched.** PROMPT R2 left room to align the test with the frontend's request shape if the diagnosis pointed there. After the diagnosis, the route handler was provably correct — Fastify, not the route, was rejecting the empty body. Adding a test that injects `Content-Type: application/json` + `payload: ''` would assert Fastify behavior, not Stocknify behavior, so it was skipped.
- **Reproduction confirmed against bare Fastify.** Spun up a minimal Fastify app and posted with vs. without `Content-Type: application/json` (no body in either case). With Content-Type → `400 / FST_ERR_CTP_EMPTY_JSON_BODY`; without → `200`. Identical error code and message to what the production frontend was hitting.
- **Why DELETE worked all along.** Fastify skips the body parser for DELETE by default, so `useDeleteProduct` was unaffected even though it had the same Content-Type-on-empty-body shape. POST is the first body-less write in the codebase, which is why this only surfaced now (with the Cycle D restore endpoint).

## Skipped or deferred

- **No new test covering the fix.** The existing 4 route tests pass and exercise the route correctly. Asserting Fastify's empty-body behavior or the client's header-omission would be a contrived regression guard for code that's already simple. Frontend tests are out of scope per the testing-strategy decision (DECISIONS 2026-05-02).
- **No backend deprecation or schema change.** The PROMPT explicitly forbade endpoint changes; only the request-side fix was in scope.

## Tests

- `pnpm -C apps/api test` → 4 test files, **12 / 12 passed** (smoke 2, upsert 2, restore 4, movements 4). 2.26s total.
- `pnpm -C apps/web typecheck` → clean.

## Codex review

Pending — review gate is enabled and runs after this result is committed.

## Memory Bank updates

- [x] `STATE.md` updated — new "Fix — Restore 400" entry at the top of "What's deployed and working"; `client.ts` row in Critical paths now notes the Content-Type omission rule.
- [x] `KNOWN_TODOS.md` — N/A; no new tech debt surfaced.
- [ ] Notion entry → ✅ Ausgeführt (after this file is committed).
- [x] This result file written.
