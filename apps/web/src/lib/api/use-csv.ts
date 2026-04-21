'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { createSupabaseBrowserClient } from '../supabase'

import { apiFetch } from './client'

import { env } from '@/env'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnMapping {
  csvColumn: string | null
  field: string
  required: boolean
  defaultValue?: string
}

export interface CsvSampleData {
  headers: string[]
  rows: string[][]
}

export interface CsvMappingTemplate {
  id: string
  tenantId: string
  name: string
  direction: 'import' | 'export'
  resourceType: 'products' | 'stock' | 'locations'
  delimiter: string
  encoding: string
  hasHeaderRow: boolean
  columnMappings: ColumnMapping[]
  defaultValues: Record<string, string>
  sampleData: CsvSampleData | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CsvPreviewResult {
  filename: string
  headers: string[]
  sampleRows: string[][]
}

export interface CsvImportError {
  row: number
  sku?: string
  reason: string
}

export interface CsvImportResult {
  totalRows: number
  created: number
  updated: number
  skipped: number
  errors: CsvImportError[]
  dryRun: boolean
}

export interface CreateMappingInput {
  name: string
  direction: 'import' | 'export'
  resourceType: 'products' | 'stock' | 'locations'
  delimiter: string
  encoding?: string
  hasHeaderRow: boolean
  columnMappings: ColumnMapping[]
  defaultValues?: Record<string, string>
  sampleData?: CsvSampleData
}

export interface UpdateMappingInput extends Partial<CreateMappingInput> {
  id: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// CSV uploads bypass apiFetch because FormData must set its own multipart
// boundary; sending `Content-Type: application/json` would corrupt the body.
async function fetchWithFormData<T>(path: string, formData: FormData): Promise<T> {
  const supabase = createSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: formData,
  })

  const contentType = res.headers.get('content-type') ?? ''
  const json = contentType.includes('application/json') ? await res.json() : null
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed with status ${String(res.status)}`
    throw new Error(message)
  }
  return (json as { data?: T } | null)?.data as T
}

// ---------------------------------------------------------------------------
// Hooks — Mapping Templates
// ---------------------------------------------------------------------------

export interface CsvMappingFilters {
  direction?: 'import' | 'export'
  resourceType?: 'products' | 'stock' | 'locations'
}

export function useCsvMappings(
  filters: CsvMappingFilters = {},
): UseQueryResult<CsvMappingTemplate[]> {
  const query = new URLSearchParams()
  if (filters.direction) query.set('direction', filters.direction)
  if (filters.resourceType) query.set('resourceType', filters.resourceType)
  const qs = query.toString() ? `?${query.toString()}` : ''
  return useQuery<CsvMappingTemplate[]>({
    queryKey: ['csv-mappings', filters],
    queryFn: () => apiFetch<CsvMappingTemplate[]>(`/csv-mappings${qs}`),
  })
}

export function useCreateCsvMapping(): UseMutationResult<
  CsvMappingTemplate,
  Error,
  CreateMappingInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMappingInput) =>
      apiFetch<CsvMappingTemplate>('/csv-mappings', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['csv-mappings'] })
    },
  })
}

export function useUpdateCsvMapping(): UseMutationResult<
  CsvMappingTemplate,
  Error,
  UpdateMappingInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateMappingInput) =>
      apiFetch<CsvMappingTemplate>(`/csv-mappings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['csv-mappings'] })
    },
  })
}

export function useDeleteCsvMapping(): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<unknown>(`/csv-mappings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['csv-mappings'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Hooks — Preview + Import (multipart)
// ---------------------------------------------------------------------------

export interface CsvPreviewInput {
  file: File
  delimiter?: string
  hasHeaderRow?: boolean
  encoding?: string
}

export function useCsvPreview(): UseMutationResult<CsvPreviewResult, Error, CsvPreviewInput> {
  return useMutation({
    mutationFn: (input) => {
      const formData = new FormData()
      formData.append('file', input.file)
      if (input.delimiter) formData.append('delimiter', input.delimiter)
      if (input.hasHeaderRow !== undefined) {
        formData.append('hasHeaderRow', input.hasHeaderRow ? 'true' : 'false')
      }
      if (input.encoding) formData.append('encoding', input.encoding)
      return fetchWithFormData<CsvPreviewResult>('/csv-mappings/preview', formData)
    },
  })
}

export interface ImportProductsInput {
  file: File
  mappingTemplateId?: string
  dryRun: boolean
}

export function useImportProducts(): UseMutationResult<
  CsvImportResult,
  Error,
  ImportProductsInput
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => {
      const formData = new FormData()
      formData.append('file', input.file)
      if (input.mappingTemplateId) {
        formData.append('mappingTemplateId', input.mappingTemplateId)
      }
      formData.append('dryRun', input.dryRun ? 'true' : 'false')
      return fetchWithFormData<CsvImportResult>(
        '/integrations/csv/import/products',
        formData,
      )
    },
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) {
        void qc.invalidateQueries({ queryKey: ['products'] })
      }
    },
  })
}

export interface ImportStockInput {
  file: File
  mappingTemplateId?: string
  dryRun: boolean
}

export function useImportStock(): UseMutationResult<CsvImportResult, Error, ImportStockInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => {
      const formData = new FormData()
      formData.append('file', input.file)
      if (input.mappingTemplateId) {
        formData.append('mappingTemplateId', input.mappingTemplateId)
      }
      formData.append('dryRun', input.dryRun ? 'true' : 'false')
      return fetchWithFormData<CsvImportResult>('/integrations/csv/import/stock', formData)
    },
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) {
        void qc.invalidateQueries({ queryKey: ['stock'] })
      }
    },
  })
}
