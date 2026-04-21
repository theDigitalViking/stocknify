'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { IntegrationLogoPlaceholder } from '@/components/integrations/integration-logo-placeholder'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import {
  useInstallIntegration,
  type MarketplaceCatalogEntry,
} from '@/lib/api/use-integrations'

interface MarketplaceInstallDialogProps {
  integration: MarketplaceCatalogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstalled?: () => void
}

export function MarketplaceInstallDialog({
  integration,
  open,
  onOpenChange,
  onInstalled,
}: MarketplaceInstallDialogProps): JSX.Element | null {
  const t = useTranslations('integrations.marketplace')
  const tCommon = useTranslations('common')
  const install = useInstallIntegration()
  const [name, setName] = useState('')

  // Reset the name each time the dialog opens against a different
  // integration. Without this, reopening against a second entry would show
  // the first entry's typed-over name.
  useEffect(() => {
    if (open) setName(integration?.name ?? '')
  }, [open, integration?.key, integration?.name])

  async function handleInstall(): Promise<void> {
    if (!integration) return
    try {
      await install.mutateAsync(integration.key)
      toast({ title: t('installSuccess', { name: name || integration.name }) })
      onInstalled?.()
      onOpenChange(false)
    } catch {
      toast({ title: t('installFailed'), variant: 'destructive' })
    }
  }

  if (!integration) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
              {integration.logoUrl ? (
                <img
                  src={integration.logoUrl}
                  alt={integration.name}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <IntegrationLogoPlaceholder name={integration.name} size={28} />
              )}
            </div>
            <DialogTitle>{t('installDialogTitle', { name: integration.name })}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="install-name" className="mb-1 block">
              {t('installNameLabel')}
            </Label>
            <Input
              id="install-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
              }}
              placeholder={integration.name}
            />
            <p className="text-xs text-muted-foreground mt-1">{t('installNameHelp')}</p>
          </div>

          <div className="rounded-md bg-muted/50 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">{t('installSettingsPlaceholder')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
            disabled={install.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={() => {
              void handleInstall()
            }}
            disabled={install.isPending}
          >
            {install.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                {t('installing')}
              </>
            ) : (
              t('installConfirm')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
