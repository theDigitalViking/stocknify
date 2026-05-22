'use client'

import {
  ChevronUp,
  File as FileIcon,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api/client'
import { useRemoteBrowse, type RemoteFile } from '@/lib/api/use-import'

// Cycle 5-E — click-through directory browser. The browser is driven by a
// credentialId; it knows nothing about integrations. The wizard uses it
// before an integration exists; the edit page uses it to pick the
// integration's importPath. Both files (.csv selected via onFileSelect) and
// directories (selected via the "Use this directory" button) are surfaced.
interface DirectoryBrowserProps {
  credentialId: string | undefined
  // Where to start. The browser keeps its own path state and never writes
  // back to the parent — callers commit via onDirectorySelect.
  initialPath?: string
  onFileSelect?: (filePath: string) => void
  // Fires when the operator clicks "Use this directory". Receives the
  // currently-displayed path (whatever the operator has clicked through to).
  onDirectorySelect?: (dirPath: string) => void
  // Highlights a file path that's already chosen elsewhere (wizard step 2).
  selectedFile?: string | null
  // Highlights the current importPath when the active path matches it, so
  // the operator can see at a glance "this is where I am now".
  selectedDirectory?: string | null
  // When false, hides the "Use this directory" button. The wizard wants
  // both file + directory selection; some surfaces may want files only.
  showDirectorySelect?: boolean
}

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${String(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function joinPath(dir: string, file: string): string {
  if (!dir || dir === '/') return file.startsWith('/') ? file : `/${file}`
  if (file.startsWith('/')) return file
  return dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`
}

function parentPath(path: string): string {
  if (!path || path === '/') return '/'
  // Strip trailing slash (if any) before locating the parent.
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

interface Crumb {
  label: string
  path: string
}

function buildCrumbs(path: string, rootLabel: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: rootLabel, path: '/' }]
  if (!path || path === '/') return crumbs
  const segments = path.split('/').filter(Boolean)
  let acc = ''
  for (const segment of segments) {
    acc = `${acc}/${segment}`
    crumbs.push({ label: segment, path: acc })
  }
  return crumbs
}

const FILE_EXT_PATTERN = /\.csv$/i

export function DirectoryBrowser({
  credentialId,
  initialPath = '',
  onFileSelect,
  onDirectorySelect,
  selectedFile = null,
  selectedDirectory = null,
  showDirectorySelect = true,
}: DirectoryBrowserProps): JSX.Element {
  const t = useTranslations('integrations.sftp.directoryBrowser')
  // The browser tracks the *active* path it is currently listing. Calls to
  // refetch / re-render keep this stable; only click-through and breadcrumb
  // clicks mutate it.
  const [activePath, setActivePath] = useState<string>(initialPath || '/')

  // Reset to the initialPath whenever the credential or initialPath changes
  // — otherwise the operator switching credentials would still see the
  // previous credential's last-visited folder.
  useEffect(() => {
    setActivePath(initialPath || '/')
  }, [credentialId, initialPath])

  const query = useRemoteBrowse(credentialId, activePath)

  const crumbs = useMemo(
    () => buildCrumbs(activePath, t('breadcrumbRoot')),
    [activePath, t],
  )

  // Sort: directories first, then files, both alphabetical (case-insensitive).
  // Depend directly on `query.data` so the memo only re-runs when the query
  // payload changes (a fresh `[]` literal would re-render unconditionally).
  const sorted = useMemo<RemoteFile[]>(() => {
    const entries = query.data ?? []
    return [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [query.data])

  const errorMessage = query.error
    ? query.error instanceof ApiError
      ? query.error.message
      : t('connectionFailed')
    : null

  const showParent = activePath !== '' && activePath !== '/'

  return (
    <div className="space-y-3">
      {/* Toolbar: breadcrumbs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <nav
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          aria-label="path breadcrumbs"
        >
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1
            return (
              <span key={crumb.path} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden>/</span> : null}
                {isLast ? (
                  <span className="font-medium text-foreground">{crumb.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePath(crumb.path)
                    }}
                    className="hover:text-foreground hover:underline"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            )
          })}
        </nav>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void query.refetch()
            }}
            disabled={!credentialId || query.isFetching}
            className="gap-1.5"
          >
            {query.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t('browse')}
          </Button>
          {showDirectorySelect && onDirectorySelect ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                onDirectorySelect(activePath)
              }}
              disabled={!credentialId}
            >
              {t('selectDirectory')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Selected-directory hint (only when the parent owns one) */}
      {selectedDirectory !== null && selectedDirectory !== undefined ? (
        <p className="text-xs text-muted-foreground">
          {t('selectedDirectoryHint', { path: selectedDirectory || '/' })}
        </p>
      ) : null}

      {!credentialId ? (
        <p className="text-xs text-muted-foreground">{t('needCredential')}</p>
      ) : errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{errorMessage}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void query.refetch()
            }}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </Button>
        </div>
      ) : query.isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('loading')}
        </p>
      ) : sorted.length === 0 && !showParent ? (
        <div className="rounded-md border border-border border-dashed px-4 py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {t('emptyDirectory')}
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('columnName')}</th>
                <th className="text-right px-3 py-2 font-medium w-24">{t('columnSize')}</th>
                <th className="text-left px-3 py-2 font-medium w-44">{t('columnModified')}</th>
              </tr>
            </thead>
            <tbody>
              {showParent ? (
                <tr
                  className="border-t border-border cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    setActivePath(parentPath(activePath))
                  }}
                >
                  <td className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
                    <ChevronUp className="h-3.5 w-3.5" />
                    {t('parentDirectory')}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                </tr>
              ) : null}
              {sorted.map((entry) => {
                const fullPath = joinPath(activePath, entry.name)
                const isDir = entry.type === 'directory'
                const isCsv = !isDir && FILE_EXT_PATTERN.test(entry.name)
                const isSelected = !isDir && selectedFile === fullPath
                const interactive = isDir || (isCsv && Boolean(onFileSelect))
                return (
                  <tr
                    key={`${entry.type}:${entry.name}`}
                    className={[
                      'border-t border-border',
                      interactive ? 'cursor-pointer hover:bg-muted/40' : '',
                      isSelected ? 'bg-brand-50' : '',
                    ].join(' ')}
                    onClick={() => {
                      if (isDir) {
                        setActivePath(fullPath)
                      } else if (isCsv && onFileSelect) {
                        onFileSelect(fullPath)
                      }
                    }}
                  >
                    <td className="px-3 py-2 flex items-center gap-2">
                      {isDir ? (
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className={isDir ? 'font-medium' : ''}>{entry.name}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {isDir ? '—' : formatBytes(entry.size)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
