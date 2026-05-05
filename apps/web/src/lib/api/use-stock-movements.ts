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
  stockType?: string
  movementType?: string
  from?: string
  to?: string
  page?: number
  perPage?: number
  sortDir?: 'asc' | 'desc'
}

export function useStockMovements(
  filters: StockMovementsFilters = {},
): UseQueryResult<ApiPage<StockMovementRow[]>> {
  const query = toQueryString({ ...filters })
  return useQuery<ApiPage<StockMovementRow[]>>({
    queryKey: ['stock', 'movements', filters],
    queryFn: () => apiFetchWithMeta<StockMovementRow[]>(`/stock/movements${query}`),
  })
}
