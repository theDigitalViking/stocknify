import type { StockTypeDefinition } from '@stocknify/shared'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { apiFetch } from './client'

export function useStockTypes(): UseQueryResult<StockTypeDefinition[]> {
  return useQuery<StockTypeDefinition[]>({
    queryKey: ['stock-types'],
    queryFn: () => apiFetch<StockTypeDefinition[]>('/stock-types'),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
