/**
 * Cycle 3-D — schedule CRUD + BullMQ repeatable wiring.
 *
 * Routes are admin-only and follow the same auth/tenant/role pattern as the
 * SFTP import routes. Each schedule maps 1:1 to a BullMQ "job scheduler"
 * (the v5 replacement for repeatable jobs); we use the schedule's UUID as
 * the scheduler ID so create/update/delete is stable across runs.
 *
 * The user never sends a cron string — the server computes it from the
 * structured fields via `buildCronExpression`. The cron string is stored on
 * the schedule row for transparency and so the worker can recover the
 * scheduler if Redis is reset.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import {
  SFTP_IMPORT_JOB_NAME,
  sftpImportQueue,
} from '../../jobs/queue.js'
import {
  buildCronExpression,
  describeCron,
  nextRunTimes,
  type ScheduleType,
} from '../../lib/cron-utils.js'
import { authMiddleware } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid()

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const timeOfDaySchema = z.string().regex(TIME_OF_DAY_RE, 'Expected HH:MM')

const scheduleTypeSchema = z.enum([
  'interval_minutes',
  'interval_hours',
  'daily',
  'weekly',
])

const createScheduleBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    resourceType: z.literal('stock'),
    direction: z.literal('import'),
    scheduleType: scheduleTypeSchema,
    intervalValue: z.number().int().min(1).max(59).optional(),
    timeOfDay: timeOfDaySchema.optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
    credentialId: uuidSchema,
    csvMappingTemplateId: uuidSchema.optional(),
    timezone: z.string().min(1).max(64).default('Europe/Berlin'),
  })
  .superRefine((data, ctx) => {
    // Validation mirrors the DB check constraint in
    // schedule-check-constraints.sql so the API surfaces the failure as a
    // 400 with a useful message instead of a Postgres-level 500.
    if (data.scheduleType === 'interval_minutes' || data.scheduleType === 'interval_hours') {
      if (data.intervalValue === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intervalValue'],
          message: `${data.scheduleType} requires intervalValue`,
        })
      }
      if (data.scheduleType === 'interval_hours' && data.intervalValue !== undefined && data.intervalValue > 23) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intervalValue'],
          message: 'interval_hours intervalValue must be <= 23',
        })
      }
    }
    if (data.scheduleType === 'daily' || data.scheduleType === 'weekly') {
      if (!data.timeOfDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['timeOfDay'],
          message: `${data.scheduleType} requires timeOfDay`,
        })
      }
    }
    if (data.scheduleType === 'weekly') {
      if (!data.weekdays || data.weekdays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weekdays'],
          message: 'weekly requires at least one weekday',
        })
      }
    }
  })

const updateScheduleBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    scheduleType: scheduleTypeSchema.optional(),
    intervalValue: z.union([z.number().int().min(1).max(59), z.null()]).optional(),
    timeOfDay: z.union([timeOfDaySchema, z.null()]).optional(),
    weekdays: z.union([z.array(z.number().int().min(1).max(7)).min(1).max(7), z.null()]).optional(),
    credentialId: uuidSchema.optional(),
    csvMappingTemplateId: z.union([uuidSchema, z.null()]).optional(),
    timezone: z.string().min(1).max(64).optional(),
    isActive: z.boolean().optional(),
  })

const integrationParamSchema = z.object({ id: uuidSchema })
const scheduleParamSchema = z.object({ id: uuidSchema, scheduleId: uuidSchema })

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

interface ScheduleRow {
  id: string
  tenantId: string
  integrationId: string
  name: string
  resourceType: string
  direction: string
  isActive: boolean
  scheduleType: string
  intervalValue: number | null
  timeOfDay: string | null
  weekdays: number[]
  cronExpression: string
  csvMappingTemplateId: string | null
  credentialId: string | null
  lastRunAt: Date | null
  lastRunStatus: string | null
  lastRunError: string | null
  nextRunAt: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

interface ScheduleResponse extends Omit<ScheduleRow, 'lastRunAt' | 'nextRunAt' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  cronDescription: string
  cronDescriptionDe: string
  timezone: string
}

// We don't carry timezone on the schedule row today — that's tracked in
// `additionalAttributes` on the credential or elsewhere. For this cycle we
// store it in a dedicated column? No — schema doesn't have one. Instead we
// store it inside the cron-string string field is not safe. Use an
// in-memory default for the response.
function shapeSchedule(row: ScheduleRow, timezone: string): ScheduleResponse {
  return {
    ...row,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    cronDescription: describeCron(row.cronExpression, 'en'),
    cronDescriptionDe: describeCron(row.cronExpression, 'de'),
    timezone,
  }
}

// Schedule timezone is not on the schema — DECISIONS callout:
// `IntegrationSchedule` does not currently carry a `timezone` column. We
// persist the cron string + a default timezone (`Europe/Berlin`) for the
// `nextRunAt` computation and the BullMQ scheduler. When tenants need
// per-schedule timezone control, add a column and thread it through
// upsertJobScheduler. Tracked in KNOWN_TODOS.
const DEFAULT_SCHEDULE_TIMEZONE = 'Europe/Berlin'

// ---------------------------------------------------------------------------
// BullMQ scheduler helpers — wrap the queue calls so route handlers stay
// readable and tests can assert on them via the vi.mock of '../../jobs/queue'.
// ---------------------------------------------------------------------------

async function registerScheduler(
  scheduleId: string,
  cron: string,
  tz: string,
): Promise<void> {
  await sftpImportQueue.upsertJobScheduler(
    scheduleId,
    { pattern: cron, tz },
    { name: SFTP_IMPORT_JOB_NAME, data: { scheduleId } },
  )
}

async function removeScheduler(scheduleId: string): Promise<void> {
  await sftpImportQueue.removeJobScheduler(scheduleId)
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function schedulesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)
  app.addHook('preHandler', requireRole('admin'))

  // -------------------------------------------------------------------------
  // GET /integrations/:id/schedules
  // -------------------------------------------------------------------------
  app.get('/integrations/:id/schedules', async (request, reply) => {
    const params = integrationParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid integration id' },
      })
    }

    const integration = await request.db.integration.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!integration) {
      return reply.code(404).send({
        error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
      })
    }

    const rows = await request.db.integrationSchedule.findMany({
      where: {
        tenantId: request.tenantId,
        integrationId: integration.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      data: rows.map((r) => shapeSchedule(r as unknown as ScheduleRow, DEFAULT_SCHEDULE_TIMEZONE)),
    })
  })

  // -------------------------------------------------------------------------
  // POST /integrations/:id/schedules
  // -------------------------------------------------------------------------
  app.post('/integrations/:id/schedules', async (request, reply) => {
    const params = integrationParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid integration id' },
      })
    }
    const body = createScheduleBodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: body.error.message },
      })
    }

    const integration = await request.db.integration.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      select: { id: true, isEnabled: true },
    })
    if (!integration) {
      return reply.code(404).send({
        error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
      })
    }

    // Validate the credential exists, belongs to the tenant, is active, and
    // (when bound) belongs to this integration. Mirrors the binding/active
    // gates from sftp-import.ts; same trust-boundary reasoning.
    const credential = await request.db.integrationCredential.findFirst({
      where: {
        id: body.data.credentialId,
        tenantId: request.tenantId,
        deletedAt: null,
      },
      select: { id: true, integrationId: true, isActive: true },
    })
    if (!credential) {
      return reply.code(404).send({
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found' },
      })
    }
    if (
      credential.integrationId !== null &&
      credential.integrationId !== integration.id
    ) {
      return reply.code(409).send({
        error: {
          code: 'CREDENTIAL_INTEGRATION_MISMATCH',
          message: 'Credential is bound to a different integration',
        },
      })
    }
    if (!credential.isActive) {
      return reply.code(409).send({
        error: {
          code: 'CREDENTIAL_INACTIVE',
          message: 'Credential is marked inactive — re-activate it before scheduling imports',
        },
      })
    }

    // Validate mapping template (when provided): tenant-scoped, import +
    // stock direction. Same shape as the manual import-now check.
    if (body.data.csvMappingTemplateId) {
      const template = await request.db.csvMappingTemplate.findFirst({
        where: {
          id: body.data.csvMappingTemplateId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
        select: { id: true, direction: true, resourceType: true },
      })
      if (!template) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Mapping template not found' },
        })
      }
      if (template.direction !== 'import' || template.resourceType !== 'stock') {
        return reply.code(400).send({
          error: {
            code: 'INVALID_TEMPLATE',
            message: 'Template must have direction=import and resourceType=stock',
          },
        })
      }
    }

    let cron: string
    try {
      cron = buildCronExpression(body.data as { scheduleType: ScheduleType; intervalValue?: number; timeOfDay?: string; weekdays?: number[] })
    } catch (err) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err instanceof Error ? err.message : 'Invalid schedule fields',
        },
      })
    }

    let nextRunAt: Date | null = null
    try {
      nextRunAt = nextRunTimes(cron, 1, body.data.timezone)[0] ?? null
    } catch (err) {
      request.log.warn({ err, cron }, 'failed to compute nextRunAt')
    }

    const created = await request.db.integrationSchedule.create({
      data: {
        tenantId: request.tenantId,
        integrationId: integration.id,
        name: body.data.name,
        resourceType: body.data.resourceType,
        direction: body.data.direction,
        scheduleType: body.data.scheduleType,
        intervalValue: body.data.intervalValue ?? null,
        timeOfDay: body.data.timeOfDay ?? null,
        weekdays: body.data.weekdays ?? [],
        cronExpression: cron,
        csvMappingTemplateId: body.data.csvMappingTemplateId ?? null,
        credentialId: body.data.credentialId,
        nextRunAt,
        isActive: true,
      },
    })

    // Register the BullMQ scheduler. Failure here logs but does not roll
    // back the DB row — the schedule remains visible in the UI; a manual
    // toggle re-registers it once Redis is reachable.
    try {
      await registerScheduler(created.id, cron, body.data.timezone)
    } catch (err) {
      request.log.error({ err, scheduleId: created.id }, 'failed to register BullMQ scheduler')
    }

    return reply.code(201).send({
      data: shapeSchedule(created as unknown as ScheduleRow, body.data.timezone),
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /integrations/:id/schedules/:scheduleId
  // -------------------------------------------------------------------------
  app.patch('/integrations/:id/schedules/:scheduleId', async (request, reply) => {
    const params = scheduleParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid id' },
      })
    }
    const body = updateScheduleBodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: body.error.message },
      })
    }

    const existing = await request.db.integrationSchedule.findFirst({
      where: {
        id: params.data.scheduleId,
        tenantId: request.tenantId,
        integrationId: params.data.id,
        deletedAt: null,
      },
    })
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      })
    }

    // Resolve the post-update field set. Any change to scheduleType /
    // intervalValue / timeOfDay / weekdays forces a cron recompute. Each
    // field is conditionally included in the merged object so that
    // exactOptionalPropertyTypes doesn't flag `undefined` as a value-shape.
    const mergedIntervalValue =
      body.data.intervalValue === undefined
        ? existing.intervalValue ?? undefined
        : body.data.intervalValue ?? undefined
    const mergedTimeOfDay =
      body.data.timeOfDay === undefined
        ? existing.timeOfDay ?? undefined
        : body.data.timeOfDay ?? undefined
    const mergedWeekdays =
      body.data.weekdays === undefined
        ? existing.weekdays
        : body.data.weekdays ?? []
    const mergedScheduleType =
      body.data.scheduleType ?? (existing.scheduleType as ScheduleType)
    const merged: {
      scheduleType: ScheduleType
      intervalValue?: number
      timeOfDay?: string
      weekdays: number[]
    } = {
      scheduleType: mergedScheduleType,
      ...(mergedIntervalValue !== undefined ? { intervalValue: mergedIntervalValue } : {}),
      ...(mergedTimeOfDay !== undefined ? { timeOfDay: mergedTimeOfDay } : {}),
      weekdays: mergedWeekdays,
    }

    let cron: string
    try {
      cron = buildCronExpression(merged)
    } catch (err) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err instanceof Error ? err.message : 'Invalid schedule fields',
        },
      })
    }

    const timezone = body.data.timezone ?? DEFAULT_SCHEDULE_TIMEZONE
    let nextRunAt: Date | null = existing.nextRunAt
    try {
      nextRunAt = nextRunTimes(cron, 1, timezone)[0] ?? null
    } catch (err) {
      request.log.warn({ err, cron }, 'failed to recompute nextRunAt')
    }

    const updated = await request.db.integrationSchedule.update({
      where: { id: existing.id },
      data: {
        name: body.data.name ?? existing.name,
        scheduleType: merged.scheduleType,
        intervalValue: merged.intervalValue ?? null,
        timeOfDay: merged.timeOfDay ?? null,
        weekdays: merged.weekdays,
        cronExpression: cron,
        credentialId: body.data.credentialId ?? existing.credentialId,
        csvMappingTemplateId:
          body.data.csvMappingTemplateId === undefined
            ? existing.csvMappingTemplateId
            : body.data.csvMappingTemplateId,
        isActive: body.data.isActive ?? existing.isActive,
        nextRunAt,
      },
    })

    // Re-register (or remove) the scheduler to match the updated row.
    try {
      if (updated.isActive) {
        await registerScheduler(updated.id, cron, timezone)
      } else {
        await removeScheduler(updated.id)
      }
    } catch (err) {
      request.log.error({ err, scheduleId: updated.id }, 'failed to sync BullMQ scheduler on update')
    }

    return reply.send({
      data: shapeSchedule(updated as unknown as ScheduleRow, timezone),
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /integrations/:id/schedules/:scheduleId — soft-delete
  // -------------------------------------------------------------------------
  app.delete('/integrations/:id/schedules/:scheduleId', async (request, reply) => {
    const params = scheduleParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid id' },
      })
    }

    const existing = await request.db.integrationSchedule.findFirst({
      where: {
        id: params.data.scheduleId,
        tenantId: request.tenantId,
        integrationId: params.data.id,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      })
    }

    await request.db.integrationSchedule.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    })

    try {
      await removeScheduler(existing.id)
    } catch (err) {
      request.log.error({ err, scheduleId: existing.id }, 'failed to remove BullMQ scheduler on delete')
    }

    return reply.send({ data: { id: existing.id, deleted: true } })
  })

  // -------------------------------------------------------------------------
  // PATCH /integrations/:id/schedules/:scheduleId/toggle
  // -------------------------------------------------------------------------
  app.patch('/integrations/:id/schedules/:scheduleId/toggle', async (request, reply) => {
    const params = scheduleParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid id' },
      })
    }

    const existing = await request.db.integrationSchedule.findFirst({
      where: {
        id: params.data.scheduleId,
        tenantId: request.tenantId,
        integrationId: params.data.id,
        deletedAt: null,
      },
    })
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      })
    }

    const nextActive = !existing.isActive
    const updated = await request.db.integrationSchedule.update({
      where: { id: existing.id },
      data: { isActive: nextActive },
    })

    try {
      if (nextActive) {
        await registerScheduler(updated.id, updated.cronExpression, DEFAULT_SCHEDULE_TIMEZONE)
      } else {
        await removeScheduler(updated.id)
      }
    } catch (err) {
      request.log.error({ err, scheduleId: updated.id }, 'failed to sync BullMQ scheduler on toggle')
    }

    return reply.send({
      data: shapeSchedule(updated as unknown as ScheduleRow, DEFAULT_SCHEDULE_TIMEZONE),
    })
  })
}
