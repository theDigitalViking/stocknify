'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { MarketplaceAppStoreModal } from '@/components/integrations/marketplace-app-store-modal'
import {
  MarketplaceIntegrationCard,
  type MarketplaceCard,
} from '@/components/integrations/marketplace-integration-card'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { useMarketplaceCatalog } from '@/lib/api/use-integrations'

export default function MarketplacePage(): JSX.Element {
  const t = useTranslations('integrations.marketplace')
  const [appStoreOpen, setAppStoreOpen] = useState(false)
  const { data: catalog = [] } = useMarketplaceCatalog()

  // Each card represents ONE installation. A catalog entry with two installs
  // renders as two cards (instance names distinguish them). Sort by install
  // time so newest installs appear first.
  const installedCards: MarketplaceCard[] = catalog
    .flatMap((entry) =>
      entry.installations.map((inst) => ({
        integrationId: inst.integrationId,
        instanceName: inst.instanceName,
        isEnabled: inst.isEnabled,
        installedAt: inst.installedAt,
        catalogKey: entry.key,
        catalogName: entry.name,
        category: entry.category,
        logoUrl: entry.logoUrl,
      })),
    )
    .sort((a, b) => b.installedAt.localeCompare(a.installedAt))

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="px-6 md:px-8 py-6 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">{t('activeTitle')}</h2>
            <Button
              size="sm"
              onClick={() => {
                setAppStoreOpen(true)
              }}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('addIntegration')}
            </Button>
          </div>

          {installedCards.length === 0 ? (
            <div className="rounded-md border border-border border-dashed px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {installedCards.map((card) => (
                <MarketplaceIntegrationCard key={card.integrationId} card={card} />
              ))}
            </div>
          )}
        </section>
      </div>

      <MarketplaceAppStoreModal
        open={appStoreOpen}
        onOpenChange={setAppStoreOpen}
        catalog={catalog}
      />
    </div>
  )
}
