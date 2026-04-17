import type { User } from '@stocknify/shared'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export function useUsers(): UseQueryResult<User[]> {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users'),
  })
}

export interface InviteUserInput {
  email: string
  role?: string
  fullName?: string
}

export function useInviteUser(): UseMutationResult<User, Error, InviteUserInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InviteUserInput) =>
      apiFetch<User>('/users/invite', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export interface UpdateUserInput {
  id: string
  role?: string
  fullName?: string
}

export function useUpdateUser(): UseMutationResult<User, Error, UpdateUserInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserInput) =>
      apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
