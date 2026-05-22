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

import { randomUUID } from 'node:crypto'

import type { FastifyInstance, FastifyRequest } from 'fastify'
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
    // Cycle 5-A.5: credentialId is now optional on the schedule. When omitted,
    // the schedule inherits Integration.credentialId (and the worker resolves
    // it at run time). The schema preserves the column as an override path
    // for a future power-user UI.
    credentialId: uuidSchema.optional(),
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
    // Cycle 5-A.5: explicit null clears the override (worker falls back to
    // Integration.credentialId); UUID sets; undefined leaves as-is.
    credentialId: z.union([uuidSchema, z.null()]).optional(),
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
  timezone: string
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
}

// Timezone is now persisted on the schedule row (Cycle 3-E review fix), so
// the response shape pulls it directly from the row instead of the route's
// in-memory default.
function shapeSchedule(row: ScheduleRow): ScheduleResponse {
  return {
    ...row,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    cronDescription: describeCron(row.cronExpression, 'en'),
    cronDescriptionDe: describeCron(row.cronExpression, 'de'),
  }
}

const DEFAULT_SCHEDULE_TIMEZONE = 'Europe/Berlin'

// Validate as IANA via Intl.DateTimeFormat — Node throws RangeError on an
// unknown timezone identifier. Used by both POST and PATCH so the same
// surface returns 400 instead of letting cron-parser blow up downstream.
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

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
// Validation helpers — shared by POST and PATCH so a credential or template
// swap on PATCH goes through the same gates as a fresh create. Returns null
// on success; on failure returns a {status, code, message} payload that the
// caller forwards to reply.
// ---------------------------------------------------------------------------

interface ValidationFailure {
  status: number
  code: string
  message: string
}

async function validateCredentialForSchedule(
  request: FastifyRequest,
  credentialId: string,
  integrationId: string,
): Promise<ValidationFailure | null> {
  const credential = await request.db.integrationCredential.findFirst({
    where: {
      id: credentialId,
      tenantId: request.tenantId,
      deletedAt: null,
    },
    select: { id: true, integrationId: true, isActive: true },
  })
  if (!credential) {
    return {
      status: 404,
      code: 'CREDENTIAL_NOT_FOUND',
      message: 'Credential not found',
    }
  }
  if (
    credential.integrationId !== null &&
    credential.integrationId !== integrationId
  ) {
    return {
      status: 409,
      code: 'CREDENTIAL_INTEGRATION_MISMATCH',
      message: 'Credential is bound to a different integration',
    }
  }
  if (!credential.isActive) {
    return {
      status: 409,
      code: 'CREDENTIAL_INACTIVE',
      message:
        'Credential is marked inactive — re-activate it before scheduling imports',
    }
  }
  return null
}

async function validateMappingTemplateForSchedule(
  request: FastifyRequest,
  templateId: string,
): Promise<ValidationFailure | null> {
  const template = await request.db.csvMappingTemplate.findFirst({
    where: {
      id: templateId,
      tenantId: request.tenantId,
      deletedAt: null,
    },
    select: { id: true, direction: true, resourceType: true },
  })
  if (!template) {
    return { status: 404, code: 'NOT_FOUND', message: 'Mapping template not found' }
  }
  if (template.direction !== 'import' || template.resourceType !== 'stock') {
    return {
      status: 400,
      code: 'INVALID_TEMPLATE',
      message: 'Template must have direction=import and resourceType=stock',
    }
  }
  return null
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
      data: rows.map((r) => shapeSchedule(r as unknown as ScheduleRow)),
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
      select: { id: true, isEnabled: true, credentialId: true },
    })
    if (!integration) {
      return reply.code(404).send({
        error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
      })
    }

    // Cycle 5-A.5: credentialId is optional on the request. When provided we
    // validate as before (the schedule stores an explicit override). When
    // omitted we require Integration.credentialId to be set so the worker
    // can resolve a credential at run time; otherwise reject with a
    // specific error so the UI can guide the user back to step 1.
    if (body.data.credentialId !== undefined) {
      const credErr = await validateCredentialForSchedule(
        request,
        body.data.credentialId,
        integration.id,
      )
      if (credErr) {
        return reply
          .code(credErr.status)
          .send({ error: { code: credErr.code, message: credErr.message } })
      }
    } else if (integration.credentialId === null) {
      return reply.code(400).send({
        error: {
          code: 'CREDENTIAL_NOT_CONFIGURED',
          message:
            'Integration has no default credential. Set one on the integration first or provide a credentialId override.',
        },
      })
    }

    if (body.data.csvMappingTemplateId) {
      const tplErr = await validateMappingTemplateForSchedule(
        request,
        body.data.csvMappingTemplateId,
      )
      if (tplErr) {
        return reply
          .code(tplErr.status)
          .send({ error: { code: tplErr.code, message: tplErr.message } })
      }
    }

    if (!isValidTimezone(body.data.timezone)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Unknown IANA timezone: ${body.data.timezone}`,
        },
      })
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

    // Atomicity fix (Cycle 3-E review): generate the schedule UUID upfront
    // and register the BullMQ scheduler BEFORE the DB insert. If Redis is
    // unreachable the DB row is never written and the route returns 503,
    // so the operator never sees a "successful" schedule that won't fire.
    // If the DB insert later fails we best-effort tear down the registered
    // scheduler so it can't fire against a non-existent schedule row.
    const scheduleId = randomUUID()
    try {
      await registerScheduler(scheduleId, cron, body.data.timezone)
    } catch (err) {
      request.log.error({ err, scheduleId }, 'failed to register BullMQ scheduler — refusing schedule create')
      return reply.code(503).send({
        error: {
          code: 'SCHEDULER_UNAVAILABLE',
          message: 'Schedule queue is not reachable — please retry shortly',
        },
      })
    }

    let created
    try {
      created = await request.db.integrationSchedule.create({
        data: {
          id: scheduleId,
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
          timezone: body.data.timezone,
          csvMappingTemplateId: body.data.csvMappingTemplateId ?? null,
          // Cycle 5-A.5: when the request omits credentialId the schedule
          // stores null and the worker falls back to Integration.credentialId
          // (resolved at run time). The schema preserves the column as an
          // explicit override path for a future power-user UI.
          credentialId: body.data.credentialId ?? null,
          nextRunAt,
          isActive: true,
        },
      })
    } catch (err) {
      // Tear down the registered scheduler so a phantom job can't fire
      // against a missing DB row. Best-effort — log, don't double-fail.
      try {
        await removeScheduler(scheduleId)
      } catch (cleanupErr) {
        request.log.error(
          { err: cleanupErr, scheduleId },
          'failed to remove orphaned scheduler after DB insert failure',
        )
      }
      throw err
    }

    return reply.code(201).send({
      data: shapeSchedule(created as unknown as ScheduleRow),
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

    // Re-validate any swapped credential or template against the same gates
    // POST enforces. Without this, a body that includes credentialId could
    // bind a credential from a different integration (or an inactive /
    // soft-deleted one), and a swapped csvMappingTemplateId could attach a
    // template with the wrong direction or resourceType.
    //
    // Cycle 5-A.5: credentialId === null clears the override (worker falls
    // back to Integration.credentialId at run time); no validation needed
    // for that path.
    if (body.data.credentialId !== undefined && body.data.credentialId !== null) {
      const credErr = await validateCredentialForSchedule(
        request,
        body.data.credentialId,
        params.data.id,
      )
      if (credErr) {
        return reply
          .code(credErr.status)
          .send({ error: { code: credErr.code, message: credErr.message } })
      }
    }
    if (
      body.data.csvMappingTemplateId !== undefined &&
      body.data.csvMappingTemplateId !== null
    ) {
      const tplErr = await validateMappingTemplateForSchedule(
        request,
        body.data.csvMappingTemplateId,
      )
      if (tplErr) {
        return reply
          .code(tplErr.status)
          .send({ error: { code: tplErr.code, message: tplErr.message } })
      }
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

    // Use the persisted column as the timezone source of truth — only
    // override when the body explicitly carries one. Cycle 3-E review fix.
    const existingTimezone =
      (existing as unknown as { timezone?: string }).timezone ?? DEFAULT_SCHEDULE_TIMEZONE
    const timezone = body.data.timezone ?? existingTimezone
    if (body.data.timezone !== undefined && !isValidTimezone(timezone)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Unknown IANA timezone: ${timezone}`,
        },
      })
    }
    let nextRunAt: Date | null = existing.nextRunAt
    try {
      nextRunAt = nextRunTimes(cron, 1, timezone)[0] ?? null
    } catch (err) {
      request.log.warn({ err, cron }, 'failed to recompute nextRunAt')
    }

    // Atomicity fix (Cycle 3-E review): sync the BullMQ scheduler BEFORE
    // updating the DB so a queue failure doesn't leave the row pointing at
    // a cron that won't fire (or, on disable, that's still firing). We
    // perform the sync against the new state — register if the post-update
    // row would be active, remove otherwise. The DB write only proceeds if
    // the queue side succeeds.
    const willBeActive = body.data.isActive ?? existing.isActive
    try {
      if (willBeActive) {
        await registerScheduler(existing.id, cron, timezone)
      } else {
        await removeScheduler(existing.id)
      }
    } catch (err) {
      request.log.error({ err, scheduleId: existing.id }, 'failed to sync BullMQ scheduler on update — refusing patch')
      return reply.code(503).send({
        error: {
          code: 'SCHEDULER_UNAVAILABLE',
          message: 'Schedule queue is not reachable — please retry shortly',
        },
      })
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
        timezone,
        credentialId:
          body.data.credentialId === undefined
            ? existing.credentialId
            : body.data.credentialId,
        csvMappingTemplateId:
          body.data.csvMappingTemplateId === undefined
            ? existing.csvMappingTemplateId
            : body.data.csvMappingTemplateId,
        isActive: willBeActive,
        nextRunAt,
      },
    })

    return reply.send({
      data: shapeSchedule(updated as unknown as ScheduleRow),
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

    // Atomicity fix (Cycle 3-E review): remove the scheduler first. On
    // failure return 503 so the operator can retry instead of being told
    // the schedule was deleted while it keeps firing in the background.
    try {
      await removeScheduler(existing.id)
    } catch (err) {
      request.log.error({ err, scheduleId: existing.id }, 'failed to remove BullMQ scheduler on delete — refusing delete')
      return reply.code(503).send({
        error: {
          code: 'SCHEDULER_UNAVAILABLE',
          message: 'Schedule queue is not reachable — please retry shortly',
        },
      })
    }

    await request.db.integrationSchedule.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    })

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

    // Atomicity fix (Cycle 3-E review): sync the BullMQ scheduler before
    // flipping the DB so we never report "active" against a queue that
    // doesn't have the job registered (or "inactive" against a queue that's
    // still firing). The persisted `timezone` column is the source of
    // truth — no fallback to the route default.
    const persistedTimezone =
      (existing as unknown as { timezone?: string }).timezone ?? DEFAULT_SCHEDULE_TIMEZONE
    try {
      if (nextActive) {
        await registerScheduler(existing.id, existing.cronExpression, persistedTimezone)
      } else {
        await removeScheduler(existing.id)
      }
    } catch (err) {
      request.log.error({ err, scheduleId: existing.id }, 'failed to sync BullMQ scheduler on toggle — refusing toggle')
      return reply.code(503).send({
        error: {
          code: 'SCHEDULER_UNAVAILABLE',
          message: 'Schedule queue is not reachable — please retry shortly',
        },
      })
    }

    const updated = await request.db.integrationSchedule.update({
      where: { id: existing.id },
      data: { isActive: nextActive },
    })

    return reply.send({
      data: shapeSchedule(updated as unknown as ScheduleRow),
    })
  })
}
