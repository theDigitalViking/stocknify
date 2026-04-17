import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Location } from '@stocknify/shared'

import { apiFetch } from './client'

export function useLocations() {
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

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLocationInput) =>
      apiFetch<Location>('/locations', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}
