'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { MarketplaceAppStoreModal } from '@/components/integrations/marketplace-app-store-modal'
import { MarketplaceIntegrationCard } from '@/components/integrations/marketplace-integration-card'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { useMarketplaceCatalog } from '@/lib/api/use-integrations'

export default function MarketplacePage(): JSX.Element {
  const t = useTranslations('integrations.marketplace')
  const [appStoreOpen, setAppStoreOpen] = useState(false)
  const { data: catalog = [] } = useMarketplaceCatalog()

  const installed = catalog.filter((i) => i.installed)

  return (
    <div>
      <PageHeader title={t('title')} />

      <div className="px-6 py-6 space-y-8">
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

          {installed.length === 0 ? (
            <div className="rounded-md border border-border border-dashed px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setAppStoreOpen(true)
                }}
              >
                {t('browseIntegrations')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {installed.map((integration) => (
                <MarketplaceIntegrationCard key={integration.key} integration={integration} />
              ))}
            </div>
          )}
        </section>
      </div>

      <MarketplaceAppStoreModal
        open={appStoreOpen}
        onOpenChange={setAppStoreOpen}
        catalog={catalog}
        installedKeys={installed.map((i) => i.key)}
      />
    </div>
  )
}
