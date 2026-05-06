'use client'

import { File as FileIcon, FolderOpen, Loader2, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api/client'
import { useRemoteFiles, type RemoteFile } from '@/lib/api/use-import'

interface DirectoryBrowserProps {
  integrationId: string
  credentialId: string | undefined
  // Initial path. The browser keeps a local-state copy so the operator can
  // edit before re-querying.
  initialPath?: string
  onFileSelect?: (filePath: string) => void
  // Highlight a file path that's already chosen elsewhere (wizard step 2).
  selectedFile?: string | null
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

export function DirectoryBrowser({
  integrationId,
  credentialId,
  initialPath = '',
  onFileSelect,
  selectedFile = null,
}: DirectoryBrowserProps): JSX.Element {
  const t = useTranslations('integrations.sftp.directoryBrowser')
  const [pathInput, setPathInput] = useState(initialPath)
  const [activePath, setActivePath] = useState<string | undefined>(initialPath || undefined)

  // When the upstream credential changes, reset the active path so the
  // browser doesn't show stale results from the previous credential's tree.
  useEffect(() => {
    setActivePath(initialPath || undefined)
    setPathInput(initialPath)
  }, [credentialId, initialPath])

  const query = useRemoteFiles(integrationId, credentialId, activePath)

  function handleBrowse(): void {
    setActivePath(pathInput || undefined)
    void query.refetch()
  }

  const files: RemoteFile[] = query.data ?? []
  const errorMessage = query.error
    ? query.error instanceof ApiError
      ? query.error.message
      : t('genericError')
    : null

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={pathInput}
          onChange={(e) => {
            setPathInput(e.target.value)
          }}
          placeholder={t('pathPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleBrowse()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleBrowse}
          disabled={!credentialId || query.isFetching}
          className="gap-1.5 flex-shrink-0"
        >
          {query.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t('browse')}
        </Button>
      </div>

      {!credentialId ? (
        <p className="text-xs text-muted-foreground">{t('needCredential')}</p>
      ) : errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </div>
      ) : query.isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('loading')}
        </p>
      ) : files.length === 0 ? (
        <div className="rounded-md border border-border border-dashed px-4 py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {t('empty')}
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
              {files.map((file) => {
                const fullPath = activePath ? joinPath(activePath, file.name) : file.name
                const isSelected = selectedFile === fullPath
                const interactive = Boolean(onFileSelect && file.type === 'file')
                return (
                  <tr
                    key={file.name}
                    className={[
                      'border-t border-border',
                      interactive ? 'cursor-pointer hover:bg-muted/40' : '',
                      isSelected ? 'bg-brand-50' : '',
                    ].join(' ')}
                    onClick={() => {
                      if (interactive) onFileSelect?.(fullPath)
                    }}
                  >
                    <td className="px-3 py-2 flex items-center gap-2">
                      <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {file.name}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {formatBytes(file.size)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : '—'}
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
