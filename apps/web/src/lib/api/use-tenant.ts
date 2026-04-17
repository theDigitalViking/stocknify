import type { Tenant } from '@stocknify/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export function useTenant(): UseQueryResult<Tenant> {
  return useQuery<Tenant>({
    queryKey: ['tenant'],
    queryFn: () => apiFetch<Tenant>('/tenant'),
  })
}

export interface UpdateTenantInput {
  name?: string
  slug?: string
}

export function useUpdateTenant(): UseMutationResult<Tenant, Error, UpdateTenantInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTenantInput) =>
      apiFetch<Tenant>('/tenant', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant'] })
    },
  })
}
