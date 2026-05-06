import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export type CredentialType = 'sftp' | 'ftp' | 'ftps'

export interface IntegrationCredential {
  id: string
  integrationId: string | null
  credentialType: CredentialType
  name: string
  host: string | null
  port: number | null
  username: string | null
  // Sensitive fields are masked by the API. Either null (not set) or the
  // shared mask string (set but redacted). Never the plaintext value.
  password: string | null
  token: string | null
  secret: string | null
  remotePath: string | null
  additionalAttributes: Record<string, unknown>
  isActive: boolean
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
  // From the list endpoint only — count of active schedules referencing this
  // credential. Drives the delete-confirm guard ("in use by N schedules").
  usageCount?: number
}

export interface ConnectionTestResult {
  success: boolean
  error?: string
}

export interface CreateCredentialInput {
  name: string
  credentialType: CredentialType
  host: string
  port?: number
  username: string
  password?: string
  remotePath?: string
  integrationId?: string
}

export interface UpdateCredentialInput {
  id: string
  name?: string
  credentialType?: CredentialType
  host?: string
  port?: number
  username?: string
  password?: string | null
  remotePath?: string | null
  integrationId?: string | null
}

export interface TestUnsavedCredentialInput {
  credentialType: CredentialType
  host: string
  port?: number
  username: string
  password?: string
  // The unsaved-test endpoint reuses the create-credential schema, so a name
  // is required server-side even though we never persist it.
  name: string
}

export function useCredentials(): UseQueryResult<IntegrationCredential[]> {
  return useQuery<IntegrationCredential[]>({
    queryKey: ['credentials'],
    queryFn: () => apiFetch<IntegrationCredential[]>('/credentials'),
  })
}

export function useCreateCredential(): UseMutationResult<
  IntegrationCredential,
  Error,
  CreateCredentialInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) =>
      apiFetch<IntegrationCredential>('/credentials', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

export function useUpdateCredential(): UseMutationResult<
  IntegrationCredential,
  Error,
  UpdateCredentialInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      apiFetch<IntegrationCredential>(`/credentials/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

export function useDeleteCredential(): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => apiFetch<unknown>(`/credentials/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
  })
}

export function useTestCredential(): UseMutationResult<ConnectionTestResult, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      apiFetch<ConnectionTestResult>(`/credentials/${id}/test`, { method: 'POST' }),
  })
}

export function useTestUnsavedCredential(): UseMutationResult<
  ConnectionTestResult,
  Error,
  TestUnsavedCredentialInput
> {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<ConnectionTestResult>('/credentials/test', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  })
}
