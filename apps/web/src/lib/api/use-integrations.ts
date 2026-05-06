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

// Shape returned by GET /integrations/:id — covers the fields the config page
// renders (name + protocol-derived metadata + health status). Backend returns
// the full Integration row; we only type the bits we use to keep this hook
// tightly coupled to the renderer.
export interface IntegrationDetail {
  id: string
  tenantId: string
  type: string
  name: string
  status: string
  isEnabled: boolean
  marketplaceKey: string | null
  category: string | null
  healthStatus: string
  lastSuccessfulSyncAt: string | null
  lastErrorAt: string | null
  consecutiveFailures: number
  createdAt: string
  updatedAt: string
}

export interface IntegrationDetailEnvelope {
  integration: IntegrationDetail
  // Locked templates are only relevant on marketplace integrations; the SFTP
  // config page doesn't need them today, but the envelope shape is fixed.
  lockedTemplates: unknown[]
}

export function useIntegration(id: string | undefined): UseQueryResult<IntegrationDetailEnvelope> {
  return useQuery<IntegrationDetailEnvelope>({
    queryKey: ['integration', id],
    queryFn: () => apiFetch<IntegrationDetailEnvelope>(`/integrations/${id ?? ''}`),
    enabled: Boolean(id),
  })
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
