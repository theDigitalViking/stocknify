'use client'

import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { IntegrationLogoPlaceholder } from '@/components/integrations/integration-logo-placeholder'
import { MarketplaceInstallDialog } from '@/components/integrations/marketplace-install-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { type MarketplaceCatalogEntry } from '@/lib/api/use-integrations'
import { cn } from '@/lib/utils'

type Category = 'all' | 'shop' | 'erp' | 'warehouse' | 'fulfiller'

const CATEGORIES: Category[] = ['all', 'shop', 'erp', 'warehouse', 'fulfiller']

interface MarketplaceAppStoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: MarketplaceCatalogEntry[]
  installedKeys: string[]
}

export function MarketplaceAppStoreModal({
  open,
  onOpenChange,
  catalog,
  installedKeys,
}: MarketplaceAppStoreModalProps): JSX.Element {
  const t = useTranslations('integrations.marketplace')
  const [category, setCategory] = useState<Category>('all')
  const [search, setSearch] = useState('')
  const [selectedIntegration, setSelectedIntegration] = useState<MarketplaceCatalogEntry | null>(
    null,
  )
  const [installDialogOpen, setInstallDialogOpen] = useState(false)

  // Show all catalog entries; already-installed ones are present but their
  // Install button is disabled and labelled accordingly so users see what they
  // already have without having to close the modal.
  const filtered = catalog.filter((i) => {
    const matchesCategory = category === 'all' || i.category === category
    const needle = search.trim().toLowerCase()
    const matchesSearch =
      needle === '' ||
      i.name.toLowerCase().includes(needle) ||
      i.description.toLowerCase().includes(needle)
    return matchesCategory && matchesSearch
  })

  function openInstallDialog(integration: MarketplaceCatalogEntry): void {
    setSelectedIntegration(integration)
    setInstallDialogOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl h-[600px] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
            <DialogTitle>{t('appStoreTitle')}</DialogTitle>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                }}
                className="pl-9"
              />
            </div>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            <div className="w-40 border-r border-border py-3 flex-shrink-0">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat)
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm transition-colors',
                    category === cat
                      ? 'bg-accent text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {t(`category.${cat}`)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t('noResults')}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((integration) => {
                    const isInstalled = installedKeys.includes(integration.key)
                    return (
                      <div
                        key={integration.key}
                        className="rounded-lg border border-border p-4 flex gap-3"
                      >
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
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{integration.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {integration.description}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs"
                            disabled={isInstalled}
                            onClick={() => {
                              openInstallDialog(integration)
                            }}
                          >
                            {isInstalled ? t('alreadyInstalled') : t('install')}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MarketplaceInstallDialog
        integration={selectedIntegration}
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
      />
    </>
  )
}
