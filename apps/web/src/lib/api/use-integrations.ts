import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export type MarketplaceCategory = 'shop' | 'erp' | 'warehouse' | 'fulfiller'

// Shape returned by GET /integrations/marketplace/catalog. `installed` is the
// per-tenant flag — `integrationId`, `isEnabled`, `installedAt` are only
// populated when the tenant actually has the integration installed.
export interface MarketplaceCatalogEntry {
  key: string
  name: string
  description: string
  category: MarketplaceCategory
  logoUrl: string
  installed: boolean
  integrationId?: string | null
  isEnabled?: boolean | null
  installedAt?: string | null
}

export function useMarketplaceCatalog(): UseQueryResult<MarketplaceCatalogEntry[]> {
  return useQuery<MarketplaceCatalogEntry[]>({
    queryKey: ['marketplace-catalog'],
    queryFn: () => apiFetch<MarketplaceCatalogEntry[]>('/integrations/marketplace/catalog'),
  })
}

export interface InstallIntegrationInput {
  key: string
  name?: string
}

export function useInstallIntegration(): UseMutationResult<unknown, Error, InstallIntegrationInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, name }: InstallIntegrationInput) =>
      apiFetch<unknown>(`/integrations/marketplace/${key}/install`, {
        method: 'POST',
        body: name ? JSON.stringify({ name }) : undefined,
      }),
    // Invalidate on settle (success + error) so the UI converges with the
    // server even when a transport error masks a successful commit.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace-catalog'] })
    },
  })
}

export function useUninstallIntegration(): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<unknown>(`/integrations/marketplace/${key}/uninstall`, { method: 'DELETE' }),
    // Invalidate on settle (success + error) so the UI converges with the
    // server even when a transport error masks a successful commit.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace-catalog'] })
    },
  })
}

export interface ToggleIntegrationInput {
  id: string
  isEnabled: boolean
}

export function useToggleIntegration(): UseMutationResult<unknown, Error, ToggleIntegrationInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isEnabled }: ToggleIntegrationInput) =>
      apiFetch<unknown>(`/integrations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled }),
      }),
    // Invalidate on settle (success + error) so the UI converges with the
    // server even when a transport error masks a successful commit.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace-catalog'] })
    },
  })
}
