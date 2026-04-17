import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Tenant } from '@stocknify/shared'

import { apiFetch } from './client'

export function useTenant() {
  return useQuery<Tenant>({
    queryKey: ['tenant'],
    queryFn: () => apiFetch<Tenant>('/tenant'),
  })
}

export interface UpdateTenantInput {
  name?: string
  slug?: string
}

export function useUpdateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTenantInput) =>
      apiFetch<Tenant>('/tenant', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant'] })
    },
  })
}
