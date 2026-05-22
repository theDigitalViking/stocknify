/**
 * Remote-path helpers for SFTP/FTP/FTPS pipelines.
 *
 * Remote servers always speak POSIX-style forward-slash paths regardless of
 * the underlying OS. Node's `path` module on Windows resolves with
 * backslashes which would break the wire protocol, so we keep our own thin
 * helpers here. They also handle the edge cases the connectors care about:
 * root paths, missing slashes, and basename extraction from a path that may
 * or may not contain a slash at all.
 *
 * Used by the worker (Cycle 3-D), the manual-import route (Cycle 3-C), and
 * the post-import action service (Cycle 5-C).
 */

export function joinRemotePath(dir: string, file: string): string {
  if (!dir || dir === '/') return file.startsWith('/') ? file : `/${file}`
  if (file.startsWith('/')) return file
  return dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`
}

export function baseName(path: string): string {
  if (!path.includes('/')) return path
  return path.slice(path.lastIndexOf('/') + 1)
}

export function dirName(path: string): string {
  if (!path.includes('/')) return ''
  const idx = path.lastIndexOf('/')
  // Root segment: '/foo' → dir '/', not the empty string.
  if (idx === 0) return '/'
  return path.slice(0, idx)
}

// ---------------------------------------------------------------------------
// Cycle 5-E review fix — path validation + containment helpers.
//
// Two attack surfaces existed before this layer:
//
//   1. `Integration.importPath` PATCH accepted any string. An absolute value
//      (`/etc`) silently overrode `credential.remotePath` because
//      `joinRemotePath` passes absolute second-arg through unchanged. The
//      worker then listed `/etc` and the post-import-action moved/deleted
//      files there.
//
//   2. `GET /credentials/:id/browse?path=...` forwarded `path` directly to
//      the SFTP/FTP listing primitives. Combined with click-through
//      navigation, any admin could enumerate `/` regardless of the
//      credential's configured remote path.
//
// The helpers here are the single source of truth for both contracts:
//
//   - `normalizeRelativeRemotePath` validates importPath / similar fields
//     that must remain *relative* segments (no leading slash, no `..`).
//   - `canonicalizeRemotePath` collapses `.` / `..` against POSIX-style
//     absolute paths and returns null if the path tries to escape root.
//   - `normalizeBaseRoot` canonicalizes a `credential.remotePath`-style
//     base (defaults to `/`, strips trailing slashes).
//   - `isUnderBase` performs the containment check used by the browse
//     endpoint to refuse paths outside `credential.remotePath`.
//
// All helpers are pure / sync and have no IO. Tests live next to them.
// ---------------------------------------------------------------------------

export type NormalizeRelativeResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: string }

/**
 * Validate that `raw` is a safe relative sub-path. Returns the normalized
 * value (or null if the input is null/empty after trim) on success, or an
 * error reason on failure. Rejections:
 *   - absolute paths (leading `/`)
 *   - parent traversal (`..` segment anywhere)
 *   - home expansion (`~` prefix)
 *   - NUL byte injection
 */
export function normalizeRelativeRemotePath(
  raw: string | null | undefined,
): NormalizeRelativeResult {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (raw.includes('\0')) return { ok: false, reason: 'must not contain NUL byte' }
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (trimmed.startsWith('/')) {
    return { ok: false, reason: 'must be relative — leading "/" is not allowed' }
  }
  if (trimmed.startsWith('~')) {
    return { ok: false, reason: 'must not start with "~"' }
  }
  const parts = trimmed.split('/').filter((p) => p.length > 0)
  for (const p of parts) {
    if (p === '.' || p === '..') {
      return { ok: false, reason: 'must not contain "." or ".." segments' }
    }
  }
  if (parts.length === 0) return { ok: true, value: null }
  return { ok: true, value: parts.join('/') }
}

/**
 * Canonicalize a POSIX-style path: collapse `.` and `..`, drop empty
 * segments, normalize repeated slashes. Returns null if a `..` would
 * escape the absolute root, signalling the caller to reject the input.
 *
 * Absolute inputs (`/foo/../bar`) canonicalize to absolute outputs (`/bar`).
 * Relative inputs return relative outputs.
 */
export function canonicalizeRemotePath(input: string): string | null {
  if (input.includes('\0')) return null
  const isAbsolute = input.startsWith('/')
  const parts: string[] = []
  for (const part of input.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) {
        // For absolute paths, `/..` escapes root → invalid. For relative
        // paths, the same rule (no escape) applies — callers should pass
        // canonicalize-then-check via isUnderBase.
        return null
      }
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return (isAbsolute ? '/' : '') + parts.join('/')
}

/**
 * Canonicalize a base root from a credential's `remotePath`. Null / empty
 * / `/` all collapse to `/`. Trailing slashes are stripped. The returned
 * value is always absolute (leading `/`).
 */
export function normalizeBaseRoot(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '/'
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  let v = trimmed
  if (!v.startsWith('/')) v = '/' + v
  // Canonicalize to collapse e.g. `/exports/./daily/..` baked into a
  // credential row. Null = invalid → fall through to '/' (defensive).
  const canon = canonicalizeRemotePath(v)
  if (canon === null) return '/'
  return canon === '' ? '/' : canon
}

/**
 * Return true when `resolved` is equal to or a descendant of `base`. Both
 * arguments must be canonicalized absolute paths. A base of `/` matches
 * every absolute path (root means no scoping — used when a credential has
 * no `remotePath` set, an operator opt-in to wide access).
 */
export function isUnderBase(resolved: string, base: string): boolean {
  if (base === '/' || base === '') return true
  if (resolved === base) return true
  return resolved.startsWith(base + '/')
}
