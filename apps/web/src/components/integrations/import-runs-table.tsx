'use client'

import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CredentialSelector } from '@/components/integrations/credential-selector'
import { DirectoryBrowser } from '@/components/integrations/directory-browser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { useImportNow, useImportRuns, type ImportRun } from '@/lib/api/use-import'

interface ImportRunsTableProps {
  integrationId: string
  // Optional default credential — pre-select inside the "Import now" dialog.
  defaultCredentialId?: string | null
}

const PAGE_SIZE = 20

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${String(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${String(m)}m ${String(s)}s`
}

function StatusBadge({ status }: { status: ImportRun['status'] }): JSX.Element {
  const t = useTranslations('integrations.sftp.runs.status')
  const map: Record<ImportRun['status'], { label: string; className: string }> = {
    success: { label: t('success'), className: 'bg-green-100 text-green-700' },
    partial: { label: t('partial'), className: 'bg-amber-100 text-amber-700' },
    failed: { label: t('failed'), className: 'bg-red-100 text-red-700' },
    running: { label: t('running'), className: 'bg-blue-100 text-blue-700' },
  }
  const v = map[status]
  return (
    <Badge variant="default" className={v.className}>
      {status === 'running' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
      {v.label}
    </Badge>
  )
}

export function ImportRunsTable({
  integrationId,
  defaultCredentialId = null,
}: ImportRunsTableProps): JSX.Element {
  const t = useTranslations('integrations.sftp.runs')
  const [page, setPage] = useState(1)
  const runs = useImportRuns(integrationId, page, PAGE_SIZE)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const data = runs.data?.data ?? []
  const total = runs.data?.meta.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setImportDialogOpen(true)
          }}
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" />
          {t('importNow')}
        </Button>
      </div>

      {runs.isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('loading')}
        </p>
      ) : data.length === 0 ? (
        <div className="rounded-md border border-border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('columnDate')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('columnFile')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('columnStatus')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('columnRows')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('columnDuration')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(run.startedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-medium text-foreground">{run.fileName ?? '—'}</span>
                    {run.errorSummary ? (
                      <p className="text-[11px] text-red-600 mt-0.5 line-clamp-2">
                        {run.errorSummary}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <span className="text-green-700">+{run.rowsCreated}</span>{' '}
                    <span className="text-blue-700">↻{run.rowsUpdated}</span>{' '}
                    <span className="text-amber-700">∅{run.rowsSkipped}</span>{' '}
                    <span className="text-red-700">✕{run.rowsErrored}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDuration(run.startedAt, run.completedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {t('pagination', {
              page,
              total: totalPages,
              count: total,
            })}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1))
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1))
              }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <ImportNowDialog
        integrationId={integrationId}
        defaultCredentialId={defaultCredentialId}
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  )
}

interface ImportNowDialogProps {
  integrationId: string
  defaultCredentialId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ImportNowDialog({
  integrationId,
  defaultCredentialId,
  open,
  onOpenChange,
}: ImportNowDialogProps): JSX.Element {
  const t = useTranslations('integrations.sftp.runs.importDialog')
  const tCommon = useTranslations('common')
  const importNow = useImportNow(integrationId)
  const [credentialId, setCredentialId] = useState<string | null>(defaultCredentialId)
  const [filePath, setFilePath] = useState<string | null>(null)

  async function handleImport(): Promise<void> {
    if (!credentialId) return
    try {
      const run = await importNow.mutateAsync({
        credentialId,
        ...(filePath ? { filePath } : {}),
      })
      if (run.status === 'success') {
        toast({ title: t('successToast', { rows: run.rowsCreated + run.rowsUpdated }) })
      } else if (run.status === 'partial') {
        toast({ title: t('partialToast'), variant: 'destructive' })
      } else {
        toast({
          title: t('failedToast'),
          description: run.errorSummary ?? undefined,
          variant: 'destructive',
        })
      }
      onOpenChange(false)
      setFilePath(null)
    } catch (err) {
      toast({
        title: t('failedToast'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="mb-1 block">{t('credentialLabel')}</Label>
            <CredentialSelector value={credentialId} onChange={setCredentialId} />
          </div>

          {credentialId ? (
            <div>
              <Label className="mb-1 block">{t('fileLabel')}</Label>
              <DirectoryBrowser
                integrationId={integrationId}
                credentialId={credentialId}
                selectedFile={filePath}
                onFileSelect={(p) => {
                  setFilePath(p)
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {filePath ? t('fileSelected', { path: filePath }) : t('autoNewest')}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={importNow.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => {
              void handleImport()
            }}
            disabled={!credentialId || importNow.isPending}
            className="gap-1.5"
          >
            {importNow.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('running')}
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                {t('confirm')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
