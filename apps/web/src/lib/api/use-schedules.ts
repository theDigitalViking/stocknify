import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { apiFetch } from './client'

export type ScheduleType = 'interval_minutes' | 'interval_hours' | 'daily' | 'weekly'

export interface IntegrationSchedule {
  id: string
  tenantId: string
  integrationId: string
  name: string
  resourceType: string
  direction: string
  isActive: boolean
  scheduleType: ScheduleType
  intervalValue: number | null
  timeOfDay: string | null
  weekdays: number[]
  cronExpression: string
  cronDescription: string
  cronDescriptionDe: string
  csvMappingTemplateId: string | null
  credentialId: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunError: string | null
  nextRunAt: string | null
  timezone: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// Cycle 5-A.5: credentialId is optional on create — the backend falls back to
// Integration.credentialId when omitted. Schedule-level override semantics
// remain in the schema for a future power-user UI; the current Edit-Page
// never passes them.
export interface CreateScheduleInput {
  name: string
  scheduleType: ScheduleType
  intervalValue?: number
  timeOfDay?: string
  weekdays?: number[]
  credentialId?: string
  csvMappingTemplateId?: string
  timezone?: string
}

export interface UpdateScheduleInput {
  scheduleId: string
  name?: string
  scheduleType?: ScheduleType
  intervalValue?: number | null
  timeOfDay?: string | null
  weekdays?: number[] | null
  credentialId?: string | null
  csvMappingTemplateId?: string | null
  timezone?: string
  isActive?: boolean
}

export function useSchedules(integrationId: string | undefined): UseQueryResult<IntegrationSchedule[]> {
  return useQuery<IntegrationSchedule[]>({
    queryKey: ['schedules', integrationId],
    queryFn: () => apiFetch<IntegrationSchedule[]>(`/integrations/${integrationId ?? ''}/schedules`),
    enabled: Boolean(integrationId),
  })
}

export function useCreateSchedule(
  integrationId: string,
): UseMutationResult<IntegrationSchedule, Error, CreateScheduleInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) =>
      apiFetch<IntegrationSchedule>(`/integrations/${integrationId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          // Server requires explicit resourceType + direction for stock import.
          resourceType: 'stock',
          direction: 'import',
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schedules', integrationId] })
      void qc.invalidateQueries({ queryKey: ['marketplace-catalog'] })
    },
  })
}

export function useUpdateSchedule(
  integrationId: string,
): UseMutationResult<IntegrationSchedule, Error, UpdateScheduleInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, ...body }) =>
      apiFetch<IntegrationSchedule>(`/integrations/${integrationId}/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schedules', integrationId] })
    },
  })
}

export function useDeleteSchedule(
  integrationId: string,
): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId) =>
      apiFetch<unknown>(`/integrations/${integrationId}/schedules/${scheduleId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schedules', integrationId] })
    },
  })
}

export function useToggleSchedule(
  integrationId: string,
): UseMutationResult<IntegrationSchedule, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId) =>
      apiFetch<IntegrationSchedule>(
        `/integrations/${integrationId}/schedules/${scheduleId}/toggle`,
        { method: 'PATCH' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['schedules', integrationId] })
    },
  })
}
