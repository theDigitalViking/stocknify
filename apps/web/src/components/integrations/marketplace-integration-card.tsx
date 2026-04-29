'use client'

import { MoreVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { IntegrationLogoPlaceholder } from '@/components/integrations/integration-logo-placeholder'
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
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import {
  useToggleIntegration,
  useUninstallIntegration,
  type MarketplaceCatalogEntry,
} from '@/lib/api/use-integrations'

interface MarketplaceIntegrationCardProps {
  integration: MarketplaceCatalogEntry
}

export function MarketplaceIntegrationCard({
  integration,
}: MarketplaceIntegrationCardProps): JSX.Element {
  const t = useTranslations('integrations.marketplace')
  const tCommon = useTranslations('common')
  const toggle = useToggleIntegration()
  const uninstall = useUninstallIntegration()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  function handleToggle(enabled: boolean): void {
    if (!integration.integrationId) return
    toggle.mutate(
      { id: integration.integrationId, isEnabled: enabled },
      {
        onError: () => {
          toast({ title: t('toggleFailed'), variant: 'destructive' })
        },
      },
    )
  }

  async function handleUninstall(): Promise<void> {
    try {
      await uninstall.mutateAsync(integration.key)
      toast({ title: t('uninstallSuccess', { name: integration.name }) })
      setConfirmOpen(false)
    } catch {
      toast({ title: t('uninstallFailed'), variant: 'destructive' })
    }
  }

  const enabled = integration.isEnabled === true

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
          {integration.logoUrl && !logoFailed ? (
            <img
              src={integration.logoUrl}
              alt={integration.name}
              className="h-8 w-8 object-contain"
              onError={() => {
                setLogoFailed(true)
              }}
            />
          ) : (
            <IntegrationLogoPlaceholder name={integration.name} size={28} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{integration.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {t(`category.${integration.category}`)}
          </p>
        </div>
        {integration.integrationId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                aria-label={t('actions')}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setConfirmOpen(true)
                }}
              >
                {t('uninstall')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Badge
          variant={enabled ? 'default' : 'secondary'}
          className={
            enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
          }
        >
          {enabled ? t('statusActive') : t('statusInactive')}
        </Badge>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={toggle.isPending || !integration.integrationId}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('uninstallConfirmTitle', { name: integration.name })}</DialogTitle>
            <DialogDescription>{t('uninstallConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false)
              }}
              disabled={uninstall.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleUninstall()
              }}
              disabled={uninstall.isPending}
            >
              {uninstall.isPending ? t('uninstalling') : t('uninstallConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
