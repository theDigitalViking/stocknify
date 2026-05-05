import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { apiFetch, toQueryString } from './client'

export interface StockRow {
  variantId: string
  productId: string
  sku: string
  productName: string
  locationId: string
  locationName: string
  locationType: string
  storageLocationId: string | null
  storageLocationName: string | null
  batchId: string | null
  batchNumber: string | null
  expiryDate: string | null
  quantities: Record<string, number>
  lastSyncedAt: string | null
}

export interface StockFilters {
  search?: string
  stockType?: string
  locationId?: string
  variantId?: string
  productId?: string
  page?: number
  perPage?: number
}

export function useStock(filters: StockFilters = {}): UseQueryResult<StockRow[]> {
  const query = toQueryString({ ...filters })
  return useQuery<StockRow[]>({
    queryKey: ['stock', filters],
    queryFn: () => apiFetch<StockRow[]>(`/stock${query}`),
  })
}

