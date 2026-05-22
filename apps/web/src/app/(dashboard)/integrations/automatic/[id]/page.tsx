'use client'

import { ArrowLeft, Check, Loader2, MoreVertical, Pencil, Save, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { CredentialSelector } from '@/components/integrations/credential-selector'
import { DirectoryBrowser } from '@/components/integrations/directory-browser'
import { ImportRunsTable } from '@/components/integrations/import-runs-table'
import { MappingTemplateSelector } from '@/components/integrations/mapping-template-selector'
import {
  ScheduleBuilder,
  type ScheduleBuilderValue,
} from '@/components/integrations/schedule-builder'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { useCredentials } from '@/lib/api/use-credentials'
import {
  useIntegration,
  useToggleIntegration,
  useUninstallIntegration,
  useUpdateIntegration,
} from '@/lib/api/use-integrations'
import {
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useToggleSchedule,
  useUpdateSchedule,
  type IntegrationSchedule,
} from '@/lib/api/use-schedules'
import { cn } from '@/lib/utils'

interface PageProps {
  params: { id: string }
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  failing: 'bg-red-500',
  paused: 'bg-gray-400',
  unknown: 'bg-gray-300',
}

export default function AutomaticIntegrationConfigPage({ params }: PageProps): JSX.Element {
  const t = useTranslations('integrations.sftp.config')
  const tSftpList = useTranslations('integrations.sftp.list')
  const tCommon = useTranslations('common')
  const tHealth = useTranslations('integrations.sftp.health')
  const router = useRouter()
  const integrationQuery = useIntegration(params.id)
  const credentialsQuery = useCredentials()
  const schedulesQuery = useSchedules(params.id)
  const toggle = useToggleIntegration()
  const uninstall = useUninstallIntegration()
  const updateIntegration = useUpdateIntegration()
  const createSchedule = useCreateSchedule(params.id)
  const updateSchedule = useUpdateSchedule(params.id)
  const deleteSchedule = useDeleteSchedule(params.id)
  const toggleSchedule = useToggleSchedule(params.id)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const integration = integrationQuery.data?.integration
  const schedules = schedulesQuery.data ?? []
  const existingSchedule: IntegrationSchedule | undefined = schedules[0]

  // Cycle 5-A.5: Credential + Mapping are now read directly from the
  // Integration row (authoritative). The schedule's own credentialId /
  // csvMappingTemplateId are deliberately ignored on the UI for now (schema
  // still carries them as a future override path).
  const credentialId = integration?.credentialId ?? null
  const mappingTemplateId = integration?.csvMappingTemplateId ?? null

  // Inline name edit (R7). `nameEditing` flips the title between the static
  // label and an Input. `nameDraft` holds the in-flight value so the
  // controlled input doesn't fight the integration row on each keystroke.
  const [nameEditing, setNameEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  useEffect(() => {
    if (nameEditing && integration) {
      setNameDraft(integration.name)
    }
  }, [nameEditing, integration])

  const [scheduleValue, setScheduleValue] = useState<ScheduleBuilderValue>({
    scheduleType: 'interval_hours',
    intervalValue: 1,
  })

  // Hydrate the schedule time fields from server data once the schedules
  // query lands. Subsequent user edits override; we never overwrite local
  // state after the initial hydration to avoid clobbering in-flight changes.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hydrated) return
    if (!schedulesQuery.data) return
    if (existingSchedule) {
      setScheduleValue({
        scheduleType: existingSchedule.scheduleType,
        intervalValue: existingSchedule.intervalValue ?? undefined,
        timeOfDay: existingSchedule.timeOfDay ?? undefined,
        weekdays: existingSchedule.weekdays.length > 0 ? existingSchedule.weekdays : undefined,
        timezone: existingSchedule.timezone,
      })
    }
    setHydrated(true)
  }, [schedulesQuery.data, existingSchedule, hydrated])

  // Show the host of the currently linked credential for a quick sanity glance.
  const linkedCredential = useMemo(() => {
    if (!credentialId) return null
    return credentialsQuery.data?.find((c) => c.id === credentialId) ?? null
  }, [credentialsQuery.data, credentialId])

  function handleEnabledToggle(next: boolean): void {
    if (!integration) return
    toggle.mutate(
      { id: integration.id, isEnabled: next },
      {
        onSuccess: () => {
          void integrationQuery.refetch()
        },
        onError: () => {
          toast({ title: t('toggleFailed'), variant: 'destructive' })
        },
      },
    )
  }

  function handleCredentialChange(nextId: string | null): void {
    if (!integration) return
    if (nextId === integration.credentialId) return
    updateIntegration.mutate(
      { id: integration.id, credentialId: nextId },
      {
        onSuccess: () => {
          toast({ title: t('credentialSaved') })
          void integrationQuery.refetch()
        },
        onError: () => {
          toast({ title: t('credentialSaveFailed'), variant: 'destructive' })
          void integrationQuery.refetch()
        },
      },
    )
  }

  function handleMappingChange(nextId: string | null): void {
    if (!integration) return
    if (nextId === integration.csvMappingTemplateId) return
    updateIntegration.mutate(
      { id: integration.id, csvMappingTemplateId: nextId },
      {
        onSuccess: () => {
          toast({ title: t('mappingSaved') })
          void integrationQuery.refetch()
        },
        onError: () => {
          toast({ title: t('mappingSaveFailed'), variant: 'destructive' })
          void integrationQuery.refetch()
        },
      },
    )
  }

  function commitNameEdit(): void {
    if (!integration) return
    const trimmed = nameDraft.trim()
    if (trimmed.length === 0 || trimmed === integration.name) {
      setNameEditing(false)
      return
    }
    updateIntegration.mutate(
      { id: integration.id, name: trimmed },
      {
        onSuccess: () => {
          toast({ title: t('nameSaved') })
          setNameEditing(false)
          void integrationQuery.refetch()
        },
        onError: () => {
          toast({ title: t('nameSaveFailed'), variant: 'destructive' })
        },
      },
    )
  }

  function cancelNameEdit(): void {
    if (integration) setNameDraft(integration.name)
    setNameEditing(false)
  }

  async function handleSaveSchedule(): Promise<void> {
    if (!integration) return
    // Cycle 5-A.5: schedule create now relies on Integration.credentialId
    // (worker fallback). Without it the backend would 400 — short-circuit
    // here with a clearer toast.
    if (!integration.credentialId) {
      toast({ title: t('needCredentialForSchedule'), variant: 'destructive' })
      return
    }
    try {
      if (existingSchedule) {
        await updateSchedule.mutateAsync({
          scheduleId: existingSchedule.id,
          name: existingSchedule.name,
          scheduleType: scheduleValue.scheduleType,
          intervalValue: scheduleValue.intervalValue ?? null,
          timeOfDay: scheduleValue.timeOfDay ?? null,
          weekdays: scheduleValue.weekdays ?? null,
        })
        toast({ title: t('scheduleSavedToast') })
      } else {
        await createSchedule.mutateAsync({
          name: integration.name ?? 'SFTP/FTP import',
          scheduleType: scheduleValue.scheduleType,
          ...(scheduleValue.intervalValue !== undefined
            ? { intervalValue: scheduleValue.intervalValue }
            : {}),
          ...(scheduleValue.timeOfDay ? { timeOfDay: scheduleValue.timeOfDay } : {}),
          ...(scheduleValue.weekdays ? { weekdays: scheduleValue.weekdays } : {}),
        })
        toast({ title: t('scheduleCreatedToast') })
      }
    } catch (err) {
      toast({
        title: t('scheduleSaveFailedToast'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  async function handleDeleteSchedule(): Promise<void> {
    if (!existingSchedule) return
    try {
      await deleteSchedule.mutateAsync(existingSchedule.id)
      toast({ title: t('scheduleDeletedToast') })
    } catch (err) {
      toast({
        title: t('scheduleDeleteFailedToast'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  function handleScheduleToggle(): void {
    if (!existingSchedule) return
    toggleSchedule.mutate(existingSchedule.id, {
      onError: () => {
        toast({ title: t('scheduleToggleFailedToast'), variant: 'destructive' })
      },
    })
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!integration) return
    try {
      await uninstall.mutateAsync(integration.id)
      toast({ title: tSftpList('deleteSuccess', { name: integration.name }) })
      setConfirmDeleteOpen(false)
      router.push('/integrations/automatic')
    } catch {
      toast({ title: tSftpList('deleteFailed'), variant: 'destructive' })
    }
  }

  if (integrationQuery.isLoading) {
    return (
      <div>
        <PageHeader title={t('loading')} />
        <div className="px-6 md:px-8 py-12 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (!integration) {
    return (
      <div>
        <PageHeader title={t('notFoundTitle')} />
        <div className="px-6 md:px-8 py-12 text-sm text-muted-foreground">
          <p>{t('notFoundBody')}</p>
          <Link
            href="/integrations/automatic"
            className="inline-flex items-center gap-1 mt-3 text-brand-600 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('backToList')}
          </Link>
        </div>
      </div>
    )
  }

  const healthLabel = tHealth(integration.healthStatus as 'healthy' | 'degraded' | 'failing' | 'paused' | 'unknown')
  const isSavingName =
    updateIntegration.isPending && updateIntegration.variables?.name !== undefined
  const isSavingCredential =
    updateIntegration.isPending && updateIntegration.variables?.credentialId !== undefined
  const isSavingMapping =
    updateIntegration.isPending && updateIntegration.variables?.csvMappingTemplateId !== undefined

  return (
    <div>
      <PageHeader
        title={
          nameEditing ? (
            <span className="inline-flex items-center gap-1.5">
              <Input
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                }}
                onBlur={commitNameEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitNameEdit()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelNameEdit()
                  }
                }}
                autoFocus
                disabled={isSavingName}
                className="h-8 w-64 text-base font-semibold"
                aria-label={t('editName')}
              />
              {isSavingName ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onMouseDown={(e) => {
                      // Prevent the input's onBlur (which would also commit)
                      // from racing against the explicit commit click. The
                      // commit still runs via the click handler.
                      e.preventDefault()
                    }}
                    onClick={commitNameEdit}
                    aria-label={t('saveName')}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onMouseDown={(e) => {
                      e.preventDefault()
                    }}
                    onClick={cancelNameEdit}
                    aria-label={t('cancelEdit')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span>{integration.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setNameEditing(true)
                }}
                aria-label={t('editName')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </span>
          )
        }
      >
        <Badge variant="outline" className="text-[10px] uppercase">
          {integration.marketplaceKey ?? 'sftp'}
        </Badge>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={cn('h-2 w-2 rounded-full', HEALTH_COLOR[integration.healthStatus] ?? HEALTH_COLOR.unknown)} />
          {healthLabel}
        </div>
        <Switch
          checked={integration.isEnabled}
          onCheckedChange={handleEnabledToggle}
          disabled={toggle.isPending}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={tSftpList('cardActions')}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                setConfirmDeleteOpen(true)
              }}
            >
              {tSftpList('cardDelete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tSftpList('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {tSftpList('deleteConfirmDescription', { name: integration.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDeleteOpen(false)
              }}
              disabled={uninstall.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete()
              }}
              disabled={uninstall.isPending}
              className="gap-1.5"
            >
              {uninstall.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {tSftpList('deleting')}
                </>
              ) : (
                tSftpList('deleteConfirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="px-6 md:px-8 py-6 space-y-6 max-w-4xl">
        <Link
          href="/integrations/automatic"
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('backToList')}
        </Link>

        {/* Health summary */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-1 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{t('lastSuccessLabel')}: </span>
              {integration.lastSuccessfulSyncAt
                ? new Date(integration.lastSuccessfulSyncAt).toLocaleString()
                : t('never')}
            </div>
            <div>
              <span className="font-medium text-foreground">{t('lastErrorLabel')}: </span>
              {integration.lastErrorAt
                ? new Date(integration.lastErrorAt).toLocaleString()
                : t('never')}
            </div>
            <div>
              <span className="font-medium text-foreground">{t('consecutiveFailuresLabel')}: </span>
              {integration.consecutiveFailures}
            </div>
          </div>
        </section>

        {/* Credentials (Cycle 5-A.5: Integration-level, auto-save) */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t('credentialsSection')}</h2>
            {isSavingCredential ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('savingShort')}
              </span>
            ) : null}
          </div>
          <CredentialSelector value={credentialId} onChange={handleCredentialChange} />
        </section>

        {/* Directory */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t('directorySection')}</h2>
          {credentialId ? (
            <DirectoryBrowser
              integrationId={integration.id}
              credentialId={credentialId}
              initialPath={linkedCredential?.remotePath ?? ''}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t('needCredential')}</p>
          )}
        </section>

        {/* Mapping (Cycle 5-A.5: Integration-level, auto-save) */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t('mappingSection')}</h2>
            {isSavingMapping ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('savingShort')}
              </span>
            ) : null}
          </div>
          <MappingTemplateSelector value={mappingTemplateId} onChange={handleMappingChange} />
        </section>

        {/* Schedule (Cycle 5-A.5: time-only) */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t('scheduleSection')}</h2>
            {existingSchedule ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{existingSchedule.isActive ? t('scheduleActive') : t('scheduleInactive')}</span>
                <Switch
                  checked={existingSchedule.isActive}
                  onCheckedChange={handleScheduleToggle}
                  disabled={toggleSchedule.isPending}
                />
              </div>
            ) : null}
          </div>

          <ScheduleBuilder value={scheduleValue} onChange={setScheduleValue} />

          {existingSchedule?.nextRunAt ? (
            <p className="text-xs text-muted-foreground">
              {t('nextRunLabel')}:{' '}
              <span className="font-medium text-foreground">
                {new Date(existingSchedule.nextRunAt).toLocaleString()}
              </span>
            </p>
          ) : null}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void handleSaveSchedule()
              }}
              disabled={createSchedule.isPending || updateSchedule.isPending || !credentialId}
              className="gap-1.5"
            >
              {createSchedule.isPending || updateSchedule.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {existingSchedule ? t('updateSchedule') : t('createSchedule')}
            </Button>
            {existingSchedule ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void handleDeleteSchedule()
                }}
                disabled={deleteSchedule.isPending}
                className="gap-1.5 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('deleteSchedule')}
              </Button>
            ) : null}
          </div>
        </section>

        {/* Import history */}
        <section className="rounded-lg border border-border bg-card p-4">
          <ImportRunsTable
            integrationId={integration.id}
            defaultCredentialId={credentialId}
          />
        </section>
      </div>
    </div>
  )
}
