'use client'

import { useTranslations } from 'next-intl'

import { IntegrationLogoPlaceholder } from '@/components/integrations/integration-logo-placeholder'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  useToggleIntegration,
  type MarketplaceCatalogEntry,
} from '@/lib/api/use-integrations'

interface MarketplaceIntegrationCardProps {
  integration: MarketplaceCatalogEntry
}

export function MarketplaceIntegrationCard({
  integration,
}: MarketplaceIntegrationCardProps): JSX.Element {
  const t = useTranslations('integrations.marketplace')
  const toggle = useToggleIntegration()

  function handleToggle(enabled: boolean): void {
    if (!integration.integrationId) return
    toggle.mutate({ id: integration.integrationId, isEnabled: enabled })
  }

  const enabled = integration.isEnabled === true

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
          {integration.logoUrl ? (
            <img
              src={integration.logoUrl}
              alt={integration.name}
              className="h-8 w-8 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <IntegrationLogoPlaceholder name={integration.name} size={28} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{integration.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {t(`category.${integration.category}`)}
          </p>
        </div>
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
    </div>
  )
}
