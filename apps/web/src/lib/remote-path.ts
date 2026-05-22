/**
 * POSIX-style remote-path helpers for the SFTP/FTP browser UI.
 *
 * Mirrors the backend helpers in `apps/api/src/lib/remote-path.ts` — kept
 * separate (rather than imported via @stocknify/shared) so the frontend
 * stays self-contained for now. If a third call site appears, promote
 * these to packages/shared.
 *
 * Cycle 5-E review fix F1: the directory browser tracks absolute paths
 * (the operator clicks through folders), but `Integration.importPath`
 * stores a relative segment under `credential.remotePath`. The backend
 * rejects absolute imports (no leading `/`, no `..`), so the frontend
 * must convert before persisting.
 */

export function normalizeBaseRoot(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '/'
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  let v = trimmed
  if (!v.startsWith('/')) v = '/' + v
  while (v.endsWith('/') && v.length > 1) v = v.slice(0, -1)
  return v
}

/**
 * Convert an absolute path produced by the directory browser to the
 * relative segment expected by the importPath PATCH contract.
 *
 *   absolute === base  → null (clear the override; falls back to base
 *                              when the worker resolves the listing dir)
 *   absolute under base → suffix without the leading slash
 *   anything else      → null (operator picked a path outside the
 *                              credential's scope; treat as clear so we
 *                              don't send something the backend will 400)
 */
export function absoluteToRelativeImportPath(
  absolute: string,
  base: string | null | undefined,
): string | null {
  const b = normalizeBaseRoot(base)
  const a = absolute.replace(/\/+$/, '') || '/'
  if (b === '/') {
    if (a === '/' || a === '') return null
    return a.startsWith('/') ? a.slice(1) : a
  }
  if (a === b) return null
  if (a.startsWith(b + '/')) return a.slice(b.length + 1)
  return null
}

/**
 * Climb one segment up while staying at or above `base`. Returns `base`
 * (not its parent) when the active path is already at the base — the
 * browser uses this to disable / no-op the parent button at the root.
 */
export function parentRemotePath(path: string, base: string): string {
  const normBase = normalizeBaseRoot(base)
  const p = path.replace(/\/+$/, '') || '/'
  if (p === normBase) return normBase
  if (p === '/' || p === '') return normBase
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return normBase
  const candidate = p.slice(0, idx)
  if (candidate === '') return '/'
  // If climbing would step above the base, clamp to base.
  if (normBase !== '/' && !candidate.startsWith(normBase)) return normBase
  return candidate
}
