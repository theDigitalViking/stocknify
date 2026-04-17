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
