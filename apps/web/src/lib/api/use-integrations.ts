import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export type MarketplaceCategory = 'shop' | 'erp' | 'warehouse' | 'fulfiller'

export interface MarketplaceInstallation {
  integrationId: string
  // The user-chosen name (e.g. "Shopify Test"). The catalog-level `name`
  // field stays static; instance names only ever live in this array.
  instanceName: string
  isEnabled: boolean
  installedAt: string
}

// Shape returned by GET /integrations/marketplace/catalog. `name`/`description`
// are always the static catalog values — never the instance name. Multiple
// installations per key are surfaced via `installations[]`.
export interface MarketplaceCatalogEntry {
  key: string
  name: string
  description: string
  category: MarketplaceCategory
  logoUrl: string
  installCount: number
  installations: MarketplaceInstallation[]
}

export function useMarketplaceCatalog(): UseQueryResult<MarketplaceCatalogEntry[]> {
  return useQuery<MarketplaceCatalogEntry[]>({
    queryKey: ['marketplace-catalog'],
    queryFn: () => apiFetch<MarketplaceCatalogEntry[]>('/integrations/marketplace/catalog'),
  })
}

// Lightweight Integration shape for list views — backend returns the full
// row but the list-side surfaces only need a handful of fields. Keep the
// type narrow so consumers don't reach into properties that may be removed
// from the response in a future cycle.
export interface IntegrationListRow {
  id: string
  name: string
  marketplaceKey: string | null
  type: string
  isEnabled: boolean
  healthStatus: string
  lastSuccessfulSyncAt: string | null
  createdAt: string
}

export function useIntegrationsList(
  type?: 'marketplace' | 'csv',
): UseQueryResult<IntegrationListRow[]> {
  return useQuery<IntegrationListRow[]>({
    queryKey: ['integrations-list', type ?? 'all'],
    queryFn: () =>
      apiFetch<IntegrationListRow[]>(
        type ? `/integrations?type=${type}` : '/integrations',
      ),
  })
}

export interface InstallIntegrationInput {
  key: string
  name?: string
}

export interface InstallIntegrationResult {
  integration: { id: string; name: string; marketplaceKey: string | null }
  lockedTemplates: unknown[]
}

export function useInstallIntegration(): UseMutationResult<
  InstallIntegrationResult,
  Error,
  InstallIntegrationInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, name }: InstallIntegrationInput) =>
      apiFetch<InstallIntegrationResult>(`/integrations/marketplace/${key}/install`, {
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

// Per-instance uninstall — targets DELETE /integrations/:id. Multi-install
// makes the old key-scoped DELETE /marketplace/:key/uninstall ambiguous; the
// new mutation takes an integrationId so each card uninstalls only itself.
export function useUninstallIntegration(): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (integrationId: string) =>
      apiFetch<unknown>(`/integrations/${integrationId}`, { method: 'DELETE' }),
    // Invalidate on settle (success + error) so the UI converges with the
    // server even when a transport error masks a successful commit. Both keys
    // are touched because Marketplace cards and the SFTP/FTP list page read
    // from different query keys but the same underlying integration rows.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace-catalog'] })
      void qc.invalidateQueries({ queryKey: ['integrations-list'] })
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
  // Cycle 5-A.5: Integration is now the authoritative source for the
  // credential + mapping. Both are nullable (operator may not have picked one
  // yet); when set they act as the default for schedules and manual imports.
  credentialId: string | null
  csvMappingTemplateId: string | null
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

// Cycle 5-A.5: generic PATCH /v1/integrations/:id mutation used by the
// Edit-Page sections (name inline-edit, credential selector, mapping
// selector) and by the Wizard's submit handler (post-install PATCH for
// credential + mapping). Invalidates the per-id query, the list page, and
// the marketplace catalog so every surface converges on the next read.
export interface UpdateIntegrationInput {
  id: string
  name?: string
  isEnabled?: boolean
  credentialId?: string | null
  csvMappingTemplateId?: string | null
}

export function useUpdateIntegration(): UseMutationResult<
  unknown,
  Error,
  UpdateIntegrationInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateIntegrationInput) =>
      apiFetch<unknown>(`/integrations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSettled: (_data, _error, { id }) => {
      void qc.invalidateQueries({ queryKey: ['integration', id] })
      void qc.invalidateQueries({ queryKey: ['integrations-list'] })
      void qc.invalidateQueries({ queryKey: ['marketplace-catalog'] })
    },
  })
}
