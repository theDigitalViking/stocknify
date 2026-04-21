import type { Location } from '@stocknify/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export function useLocations(): UseQueryResult<Location[]> {
  return useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => apiFetch<Location[]>('/locations'),
  })
}

export interface CreateLocationInput {
  name: string
  type: string
  address?: Record<string, unknown>
  binTrackingEnabled?: boolean
}

export function useCreateLocation(): UseMutationResult<Location, Error, CreateLocationInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLocationInput) =>
      apiFetch<Location>('/locations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}

export interface StorageLocationRow {
  id: string
  locationId: string
  name: string
  type: string
}

// Tenant-wide list of storage locations (bins/shelves). When `locationId` is
// passed, the call is scoped to a single parent location via the existing
// per-location endpoint; otherwise the flat `/storage-locations` endpoint is
// used (powers the stock-page filter dropdown).
export function useStorageLocations(
  locationId?: string,
): UseQueryResult<StorageLocationRow[]> {
  return useQuery<StorageLocationRow[]>({
    queryKey: ['storage-locations', locationId ?? null],
    queryFn: () =>
      apiFetch<StorageLocationRow[]>(
        locationId
          ? `/locations/${locationId}/storage-locations`
          : '/storage-locations',
      ),
  })
}
