import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { StockMovement } from '@stocknify/shared'

import { apiFetch, toQueryString } from './client'

export interface StockRow {
  variantId: string
  sku: string
  productName: string
  locationId: string
  locationName: string
  locationType: string
  quantities: Record<string, number>
  lastSyncedAt: string | null
}

export interface StockFilters {
  search?: string
  stockType?: string
  locationId?: string
  variantId?: string
  page?: number
  perPage?: number
}

export function useStock(filters: StockFilters = {}) {
  const query = toQueryString({ ...filters })
  return useQuery<StockRow[]>({
    queryKey: ['stock', filters],
    queryFn: () => apiFetch<StockRow[]>(`/stock${query}`),
  })
}

export interface StockMovementFilters {
  variantId?: string
  locationId?: string
  movementType?: string
  from?: string
  to?: string
  page?: number
  perPage?: number
}

export function useStockMovements(filters: StockMovementFilters = {}) {
  const query = toQueryString({ ...filters })
  return useQuery<StockMovement[]>({
    queryKey: ['stock', 'movements', filters],
    queryFn: () => apiFetch<StockMovement[]>(`/stock/movements${query}`),
  })
}

export interface UpsertStockInput {
  variantId: string
  locationId: string
  storageLocationId?: string
  batchId?: string
  stockType: string
  quantity: number
  reason?: string
}

export function useUpsertStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertStockInput) =>
      apiFetch<unknown>('/stock', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock'] })
    },
  })
}
