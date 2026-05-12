import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { apiFetchWithMeta, toQueryString, type ApiPage } from './client'

export interface StockMovementRow {
  id: string
  variantId: string
  variantSku: string
  productId: string
  productName: string
  locationId: string
  locationName: string
  storageLocationId: string | null
  storageLocationName: string | null
  batchId: string | null
  batchNumber: string | null
  stockType: string
  quantity: number
  quantityBefore: number
  delta: number
  movementType: string
  source: string | null
  createdAt: string
}

export interface StockMovementsFilters {
  productId?: string
  variantId?: string
  locationId?: string
  storageLocationId?: string
  stockType?: string
  // Comma-separated plural variants (Cycle 4-E). Plural wins server-side when
  // both singular and plural are present.
  locationIds?: string
  storageLocationIds?: string
  stockTypes?: string
  movementType?: string
  from?: string
  to?: string
  page?: number
  perPage?: number
  sortDir?: 'asc' | 'desc'
}

export interface UseStockMovementsOptions {
  // Gate the fetch — callers pass `enabled: false` when the page-level filter
  // state means "no rows should be shown" (Cycle 4-E review fix). The default
  // is `true` so existing call sites keep their previous fetch-on-mount
  // behavior.
  enabled?: boolean
}

export function useStockMovements(
  filters: StockMovementsFilters = {},
  options: UseStockMovementsOptions = {},
): UseQueryResult<ApiPage<StockMovementRow[]>> {
  const query = toQueryString({ ...filters })
  return useQuery<ApiPage<StockMovementRow[]>>({
    queryKey: ['stock', 'movements', filters],
    queryFn: () => apiFetchWithMeta<StockMovementRow[]>(`/stock/movements${query}`),
    enabled: options.enabled ?? true,
  })
}
