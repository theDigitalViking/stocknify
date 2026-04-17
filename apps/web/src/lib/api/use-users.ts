import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { User } from '@stocknify/shared'

import { apiFetch } from './client'

export function useUsers() {
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

export function useInviteUser() {
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

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserInput) =>
      apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
