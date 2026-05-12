'use client'

import { ChevronRight, Loader2, Plus, SlidersHorizontal, Wand2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { SetupWizard } from '@/components/integrations/setup-wizard'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import {
  useInstallIntegration,
  useIntegrationsList,
  useToggleIntegration,
} from '@/lib/api/use-integrations'
import { useSchedules } from '@/lib/api/use-schedules'
import { cn } from '@/lib/utils'

// SFTP/FTP marketplace keys this list surfaces as "automated integrations".
// We pivot off marketplaceKey because the Integration row's `type` column
// mirrors the catalog key for marketplace installs (see install handler).
const AUTOMATIC_KEYS = new Set(['sftp', 'ftp', 'ftps'])

const HEALTH_DOT: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  failing: 'bg-red-500',
  paused: 'bg-gray-400',
  unknown: 'bg-gray-300',
}

export default function AutomaticPage(): JSX.Element {
  const t = useTranslations('integrations.automatic')
  const tSftp = useTranslations('integrations.sftp.list')
  const integrations = useIntegrationsList('marketplace')
  const [chooserOpen, setChooserOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const automatic = (integrations.data ?? []).filter(
    (row) => row.marketplaceKey !== null && AUTOMATIC_KEYS.has(row.marketplaceKey),
  )

  function openChooser(): void {
    setChooserOpen(true)
  }

  function handlePickWizard(): void {
    setChooserOpen(false)
    setWizardOpen(true)
  }

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="px-6 md:px-8 py-6 space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            {tSftp('activeTitle')}
          </h2>
          <Button size="sm" onClick={openChooser} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {tSftp('addIntegration')}
          </Button>
        </div>

        {automatic.length === 0 ? (
          <div className="rounded-md border border-border border-dashed px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{tSftp('emptyTitle')}</p>
            <p className="text-xs text-muted-foreground mt-1">{tSftp('emptyBody')}</p>
            <Button size="sm" onClick={openChooser} className="gap-1.5 mt-4">
              <Plus className="h-3.5 w-3.5" />
              {tSftp('addFirst')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {automatic.map((row) => (
              <AutomaticCard key={row.id} integration={row} />
            ))}
          </div>
        )}
      </div>

      <AddMethodDialog
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        onPickWizard={handlePickWizard}
      />
      <SetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}

interface AddMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPickWizard: () => void
}

function AddMethodDialog({
  open,
  onOpenChange,
  onPickWizard,
}: AddMethodDialogProps): JSX.Element {
  const tSftp = useTranslations('integrations.sftp.list')
  const router = useRouter()
  const install = useInstallIntegration()

  function handlePickDirect(): void {
    install.mutate(
      { key: 'sftp', name: 'SFTP Import' },
      {
        onSuccess: (result) => {
          onOpenChange(false)
          router.push(`/integrations/automatic/${result.integration.id}`)
        },
        onError: () => {
          toast({ title: tSftp('addDirectFailed'), variant: 'destructive' })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tSftp('addMethodTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tSftp('addMethodTitle')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={onPickWizard}
            disabled={install.isPending}
            className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-accent transition disabled:opacity-50"
          >
            <Wand2 className="h-5 w-5 text-brand-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {tSftp('addMethodWizard')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tSftp('addMethodWizardDescription')}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={handlePickDirect}
            disabled={install.isPending}
            className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-left hover:bg-accent transition disabled:opacity-50"
          >
            {install.isPending ? (
              <Loader2 className="h-5 w-5 text-brand-600 mt-0.5 shrink-0 animate-spin" />
            ) : (
              <SlidersHorizontal className="h-5 w-5 text-brand-600 mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {tSftp('addMethodDirect')}
              </p>
              <p className="text-xs text-muted-foreground">
                {tSftp('addMethodDirectDescription')}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface AutomaticCardProps {
  integration: {
    id: string
    name: string
    marketplaceKey: string | null
    isEnabled: boolean
    healthStatus: string
    lastSuccessfulSyncAt: string | null
  }
}

function AutomaticCard({ integration }: AutomaticCardProps): JSX.Element {
  const tSftp = useTranslations('integrations.sftp.list')
  const toggle = useToggleIntegration()
  const schedulesQuery = useSchedules(integration.id)
  const enabled = integration.isEnabled

  const healthClass = HEALTH_DOT[integration.healthStatus] ?? HEALTH_DOT.unknown

  function handleToggle(next: boolean): void {
    toggle.mutate(
      { id: integration.id, isEnabled: next },
      {
        onError: () => {
          toast({ title: tSftp('toggleFailed'), variant: 'destructive' })
        },
      },
    )
  }

  const firstActiveSchedule = schedulesQuery.data?.find((s) => s.isActive)
  const lastSuccess = integration.lastSuccessfulSyncAt ?? firstActiveSchedule?.lastRunAt

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/integrations/automatic/${integration.id}`}
              className="text-sm font-medium text-foreground hover:underline truncate"
            >
              {integration.name}
            </Link>
            {integration.marketplaceKey ? (
              <Badge variant="outline" className="text-[10px] uppercase">
                {integration.marketplaceKey}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', healthClass)} />
            {lastSuccess
              ? tSftp('lastSync', { date: new Date(lastSuccess).toLocaleString() })
              : tSftp('notYetRun')}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={toggle.isPending}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {firstActiveSchedule
            ? firstActiveSchedule.cronDescription
            : tSftp('noSchedule')}
        </span>
        <Link
          href={`/integrations/automatic/${integration.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline"
        >
          {tSftp('configure')}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
