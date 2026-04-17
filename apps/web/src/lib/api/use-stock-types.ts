import { useQuery } from '@tanstack/react-query'

import type { StockTypeDefinition } from '@stocknify/shared'

import { apiFetch } from './client'

export function useStockTypes() {
  return useQuery<StockTypeDefinition[]>({
    queryKey: ['stock-types'],
    queryFn: () => apiFetch<StockTypeDefinition[]>('/stock-types'),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
