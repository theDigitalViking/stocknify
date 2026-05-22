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
