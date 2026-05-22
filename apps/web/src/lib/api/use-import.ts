import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch, apiFetchWithMeta, toQueryString, type ApiPage } from './client'

export interface RemoteFile {
  name: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string | null
}

export interface ImportRun {
  id: string
  tenantId: string
  integrationId: string
  scheduleId: string | null
  credentialId: string | null
  trigger: 'manual' | 'scheduled'
  status: 'running' | 'success' | 'partial' | 'failed'
  fileName: string | null
  fileSizeBytes: number | null
  rowsTotal: number
  rowsCreated: number
  rowsUpdated: number
  rowsSkipped: number
  rowsErrored: number
  errorSummary: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export interface ImportNowInput {
  credentialId: string
  filePath?: string
  mappingTemplateId?: string
}

export function useRemoteFiles(
  integrationId: string,
  credentialId: string | undefined,
  path?: string,
): UseQueryResult<RemoteFile[]> {
  const qs = toQueryString({ credentialId, path })
  return useQuery<RemoteFile[]>({
    queryKey: ['remote-files', integrationId, credentialId ?? null, path ?? null],
    queryFn: () => apiFetch<RemoteFile[]>(`/integrations/${integrationId}/files${qs}`),
    enabled: Boolean(integrationId && credentialId),
    // Each call opens an SFTP/FTP socket, so we keep results around briefly
    // and never refetch on focus to avoid hammering the remote server.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

// Cycle 5-E — credential-only directory listing used by the click-through
// browser. Lists files AND directories (no extension filter). The wizard
// uses it before an integration exists; the edit page uses it for the
// import-path picker.
export function useRemoteBrowse(
  credentialId: string | undefined,
  path: string | undefined,
): UseQueryResult<RemoteFile[]> {
  const qs = toQueryString({ path })
  return useQuery<RemoteFile[]>({
    queryKey: ['remote-browse', credentialId ?? null, path ?? null],
    queryFn: () =>
      apiFetch<RemoteFile[]>(`/credentials/${credentialId ?? ''}/browse${qs}`),
    enabled: Boolean(credentialId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useImportNow(
  integrationId: string,
): UseMutationResult<ImportRun, Error, ImportNowInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) =>
      apiFetch<ImportRun>(`/integrations/${integrationId}/import-now`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['import-runs', integrationId] })
      // A successful import touches stock — refresh the cache so the user
      // sees the new quantities without having to navigate away and back.
      void qc.invalidateQueries({ queryKey: ['stock'] })
    },
  })
}

export function useImportRuns(
  integrationId: string | undefined,
  page = 1,
  perPage = 20,
): UseQueryResult<ApiPage<ImportRun[]>> {
  const qs = toQueryString({ page, perPage })
  return useQuery<ApiPage<ImportRun[]>>({
    queryKey: ['import-runs', integrationId, page, perPage],
    queryFn: () =>
      apiFetchWithMeta<ImportRun[]>(`/integrations/${integrationId ?? ''}/runs${qs}`),
    enabled: Boolean(integrationId),
  })
}
