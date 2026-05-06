import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sftpImportQueue } from '../../../jobs/queue.js'
import {
  buildCronExpression,
  describeCron,
} from '../../../lib/cron-utils.js'
import { authedHeaders } from '../../../test/auth.js'
import { buildTestApp } from '../../../test/build-app.js'
import { createTestTenant, testDb } from '../../../test/db.js'

// Mock the queue module so tests never touch Redis. Both the schedules
// routes and the worker registration import the queue exports from this
// module — replacing them here keeps every code path that talks to BullMQ
// observable via spies.
vi.mock('../../../jobs/queue.js', () => {
  const upsertJobScheduler = vi.fn(async () => undefined)
  const removeJobScheduler = vi.fn(async () => undefined)
  return {
    SFTP_IMPORT_QUEUE_NAME: 'sftp-import',
    SFTP_IMPORT_JOB_NAME: 'sftp-import',
    redis: { on: vi.fn(), quit: vi.fn() },
    syncStockQueue: { add: vi.fn() },
    evaluateRulesQueue: { add: vi.fn() },
    sendNotificationQueue: { add: vi.fn() },
    sftpImportQueue: { upsertJobScheduler, removeJobScheduler },
    startSftpImportWorker: vi.fn(),
  }
})

const mockedUpsert = vi.mocked(sftpImportQueue.upsertJobScheduler)
const mockedRemove = vi.mocked(sftpImportQueue.removeJobScheduler)

beforeEach(() => {
  mockedUpsert.mockReset()
  mockedUpsert.mockResolvedValue(undefined as never)
  mockedRemove.mockReset()
  mockedRemove.mockResolvedValue(undefined as never)
})

interface ScheduleBody {
  data: {
    id: string
    integrationId: string
    name: string
    scheduleType: string
    intervalValue: number | null
    timeOfDay: string | null
    weekdays: number[]
    cronExpression: string
    cronDescription: string
    cronDescriptionDe: string
    nextRunAt: string | null
    isActive: boolean
    credentialId: string | null
    timezone: string
  }
}

interface ScheduleListBody {
  data: ScheduleBody['data'][]
}

interface ErrorBody {
  error: { code: string; message: string }
}

interface SeedResult {
  tenant: { id: string }
  user: { id: string }
  integration: { id: string }
  credential: { id: string }
  headers: { authorization: string }
}

async function seedScenario(
  overrides: { credentialActive?: boolean } = {},
): Promise<SeedResult> {
  const { tenant, user } = await createTestTenant(testDb)
  const integration = await testDb.integration.create({
    data: {
      tenantId: tenant.id,
      type: 'sftp',
      name: 'Hive SFTP',
      status: 'active',
    },
  })
  const credential = await testDb.integrationCredential.create({
    data: {
      tenantId: tenant.id,
      integrationId: integration.id,
      credentialType: 'sftp',
      name: 'Hive Production',
      host: 'sftp.hive.example.com',
      port: 22,
      username: 'sebastian',
      password: 'enc-blob:irrelevant-for-schedules',
      remotePath: '/exports',
      isActive: overrides.credentialActive ?? true,
    },
  })
  return {
    tenant,
    user,
    integration,
    credential,
    headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
  }
}

// ---------------------------------------------------------------------------
// buildCronExpression — unit tests
// ---------------------------------------------------------------------------

describe('buildCronExpression', () => {
  it('maps interval_minutes(30) → "*/30 * * * *"', () => {
    expect(
      buildCronExpression({ scheduleType: 'interval_minutes', intervalValue: 30 }),
    ).toBe('*/30 * * * *')
  })

  it('maps interval_hours(2) → "0 */2 * * *"', () => {
    expect(
      buildCronExpression({ scheduleType: 'interval_hours', intervalValue: 2 }),
    ).toBe('0 */2 * * *')
  })

  it('maps daily(06:30) → "30 6 * * *"', () => {
    expect(
      buildCronExpression({ scheduleType: 'daily', timeOfDay: '06:30' }),
    ).toBe('30 6 * * *')
  })

  it('maps weekly([1,3,5], 17:30) → "30 17 * * 1,3,5"', () => {
    expect(
      buildCronExpression({
        scheduleType: 'weekly',
        timeOfDay: '17:30',
        weekdays: [1, 3, 5],
      }),
    ).toBe('30 17 * * 1,3,5')
  })

  it('converts ISO Sunday (7) to cron Sunday (0) for weekly', () => {
    expect(
      buildCronExpression({
        scheduleType: 'weekly',
        timeOfDay: '08:00',
        weekdays: [7, 1],
      }),
    ).toBe('0 8 * * 0,1')
  })

  it('throws on missing intervalValue for interval_minutes', () => {
    expect(() =>
      buildCronExpression({ scheduleType: 'interval_minutes' }),
    ).toThrow()
  })

  it('throws on missing weekdays for weekly', () => {
    expect(() =>
      buildCronExpression({ scheduleType: 'weekly', timeOfDay: '08:00' }),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// describeCron — locale rendering
// ---------------------------------------------------------------------------

describe('describeCron', () => {
  it('renders interval_minutes in English and German', () => {
    expect(describeCron('*/30 * * * *', 'en')).toBe('Every 30 minutes')
    expect(describeCron('*/30 * * * *', 'de')).toBe('Alle 30 Minuten')
  })

  it('renders interval_hours in English and German', () => {
    expect(describeCron('0 */2 * * *', 'en')).toBe('Every 2 hours')
    expect(describeCron('0 */2 * * *', 'de')).toBe('Alle 2 Stunden')
  })

  it('renders daily in English and German', () => {
    expect(describeCron('0 6 * * *', 'en')).toBe('Daily at 06:00')
    expect(describeCron('0 6 * * *', 'de')).toBe('Täglich um 06:00')
  })

  it('renders weekly in English and German', () => {
    expect(describeCron('30 17 * * 1,3,5', 'en')).toBe(
      'Monday, Wednesday, Friday at 17:30',
    )
    expect(describeCron('30 17 * * 1,3,5', 'de')).toBe(
      'Montag, Mittwoch, Freitag um 17:30',
    )
  })
})

// ---------------------------------------------------------------------------
// Schedule CRUD via app.inject
// ---------------------------------------------------------------------------

describe('POST /v1/integrations/:id/schedules', () => {
  it('creates a schedule, persists the cron, and registers a BullMQ scheduler', async () => {
    const seed = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'Daily 06:00',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '06:00',
          credentialId: seed.credential.id,
          timezone: 'Europe/Berlin',
        },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json() as ScheduleBody
      expect(body.data.cronExpression).toBe('0 6 * * *')
      expect(body.data.cronDescription).toBe('Daily at 06:00')
      expect(body.data.cronDescriptionDe).toBe('Täglich um 06:00')
      expect(body.data.nextRunAt).toBeTruthy()
      expect(body.data.isActive).toBe(true)

      // BullMQ scheduler registered with the same cron + timezone.
      expect(mockedUpsert).toHaveBeenCalledTimes(1)
      const [schedulerId, repeatOpts, jobTemplate] =
        mockedUpsert.mock.calls[0] ?? []
      expect(schedulerId).toBe(body.data.id)
      expect(repeatOpts).toEqual({ pattern: '0 6 * * *', tz: 'Europe/Berlin' })
      expect(jobTemplate).toMatchObject({
        name: 'sftp-import',
        data: { scheduleId: body.data.id },
      })

      // DB row matches.
      const dbRow = await testDb.integrationSchedule.findUnique({
        where: { id: body.data.id },
      })
      expect(dbRow?.cronExpression).toBe('0 6 * * *')
      expect(dbRow?.scheduleType).toBe('daily')
      expect(dbRow?.timeOfDay).toBe('06:00')
    } finally {
      await app.close()
    }
  })

  it('rejects interval_minutes without intervalValue with 400', async () => {
    const seed = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'broken',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'interval_minutes',
          credentialId: seed.credential.id,
        },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as ErrorBody).error.code).toBe('VALIDATION_ERROR')
    } finally {
      await app.close()
    }
  })

  it('rejects weekly without weekdays with 400', async () => {
    const seed = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'broken',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'weekly',
          timeOfDay: '08:00',
          credentialId: seed.credential.id,
        },
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('rejects invalid timeOfDay format with 400', async () => {
    const seed = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'broken',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '6:00 am',
          credentialId: seed.credential.id,
        },
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('rejects viewer role with 403', async () => {
    const seed = await seedScenario()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: authedHeaders({
          tenantId: seed.tenant.id,
          userId: seed.user.id,
          role: 'viewer',
        }),
        payload: {
          name: 'x',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '06:00',
          credentialId: seed.credential.id,
        },
      })
      expect(res.statusCode).toBe(403)
    } finally {
      await app.close()
    }
  })

  it('refuses an inactive credential with 409 CREDENTIAL_INACTIVE', async () => {
    const seed = await seedScenario({ credentialActive: false })
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'x',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '06:00',
          credentialId: seed.credential.id,
        },
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe('CREDENTIAL_INACTIVE')
    } finally {
      await app.close()
    }
  })
})

// ---------------------------------------------------------------------------
// Codex review fixes — 2026-05-08
// PATCH must re-validate any swapped credentialId or csvMappingTemplateId
// against the same gates POST enforces; otherwise an admin can bind a
// credential from a different integration (or a deleted/inactive one), or
// attach a template with the wrong direction/resourceType, in a single
// PATCH call.
// ---------------------------------------------------------------------------

describe('PATCH /schedules/:scheduleId — credential/template re-validation (Codex review fix)', () => {
  async function createSchedule(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    seed: SeedResult,
  ): Promise<ScheduleBody> {
    const created = await app.inject({
      method: 'POST',
      url: `/v1/integrations/${seed.integration.id}/schedules`,
      headers: seed.headers,
      payload: {
        name: 'baseline',
        resourceType: 'stock',
        direction: 'import',
        scheduleType: 'daily',
        timeOfDay: '06:00',
        credentialId: seed.credential.id,
      },
    })
    expect(created.statusCode).toBe(201)
    return created.json() as ScheduleBody
  }

  it('rejects a credential bound to a different integration with 409 CREDENTIAL_INTEGRATION_MISMATCH', async () => {
    const seed = await seedScenario()
    // Second integration in the same tenant + a credential bound to it.
    const otherIntegration = await testDb.integration.create({
      data: {
        tenantId: seed.tenant.id,
        type: 'sftp',
        name: 'Other SFTP',
        status: 'active',
      },
    })
    const otherBoundCredential = await testDb.integrationCredential.create({
      data: {
        tenantId: seed.tenant.id,
        integrationId: otherIntegration.id,
        credentialType: 'sftp',
        name: 'Other Bound',
        host: 'sftp.other.example.com',
        port: 22,
        username: 'sebastian',
        password: 'enc-blob:irrelevant',
        remotePath: '/exports',
        isActive: true,
      },
    })
    const app = await buildTestApp()
    try {
      const schedule = await createSchedule(app, seed)
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${schedule.data.id}`,
        headers: seed.headers,
        payload: { credentialId: otherBoundCredential.id },
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe(
        'CREDENTIAL_INTEGRATION_MISMATCH',
      )
      // DB row not touched.
      const dbRow = await testDb.integrationSchedule.findUnique({
        where: { id: schedule.data.id },
      })
      expect(dbRow?.credentialId).toBe(seed.credential.id)
    } finally {
      await app.close()
    }
  })

  it('rejects an inactive credential on PATCH with 409 CREDENTIAL_INACTIVE', async () => {
    const seed = await seedScenario()
    const inactiveCredential = await testDb.integrationCredential.create({
      data: {
        tenantId: seed.tenant.id,
        integrationId: seed.integration.id,
        credentialType: 'sftp',
        name: 'Stood-down',
        host: 'sftp.hive.example.com',
        port: 22,
        username: 'sebastian',
        password: 'enc-blob:irrelevant',
        remotePath: '/exports',
        isActive: false,
      },
    })
    const app = await buildTestApp()
    try {
      const schedule = await createSchedule(app, seed)
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${schedule.data.id}`,
        headers: seed.headers,
        payload: { credentialId: inactiveCredential.id },
      })
      expect(res.statusCode).toBe(409)
      expect((res.json() as ErrorBody).error.code).toBe('CREDENTIAL_INACTIVE')
    } finally {
      await app.close()
    }
  })

  it('rejects a credential from another tenant on PATCH with 404 CREDENTIAL_NOT_FOUND', async () => {
    const seed = await seedScenario()
    const otherTenant = await seedScenario()
    const app = await buildTestApp()
    try {
      const schedule = await createSchedule(app, seed)
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${schedule.data.id}`,
        headers: seed.headers,
        payload: { credentialId: otherTenant.credential.id },
      })
      expect(res.statusCode).toBe(404)
      expect((res.json() as ErrorBody).error.code).toBe('CREDENTIAL_NOT_FOUND')
    } finally {
      await app.close()
    }
  })

  it('rejects a mapping template with wrong direction on PATCH with 400 INVALID_TEMPLATE', async () => {
    const seed = await seedScenario()
    const exportTemplate = await testDb.csvMappingTemplate.create({
      data: {
        tenantId: seed.tenant.id,
        name: 'Stock export',
        resourceType: 'stock',
        direction: 'export',
        delimiter: ',',
        encoding: 'utf-8',
        hasHeaderRow: true,
        columnMappings: [],
        defaultValues: {},
      },
    })
    const app = await buildTestApp()
    try {
      const schedule = await createSchedule(app, seed)
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${schedule.data.id}`,
        headers: seed.headers,
        payload: { csvMappingTemplateId: exportTemplate.id },
      })
      expect(res.statusCode).toBe(400)
      expect((res.json() as ErrorBody).error.code).toBe('INVALID_TEMPLATE')
    } finally {
      await app.close()
    }
  })

  it('clears the mapping template via PATCH null without re-validating', async () => {
    const seed = await seedScenario()
    const importTemplate = await testDb.csvMappingTemplate.create({
      data: {
        tenantId: seed.tenant.id,
        name: 'Stock import',
        resourceType: 'stock',
        direction: 'import',
        delimiter: ',',
        encoding: 'utf-8',
        hasHeaderRow: true,
        columnMappings: [],
        defaultValues: {},
      },
    })
    const app = await buildTestApp()
    try {
      // Create with the template attached, then clear it.
      const created = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'with template',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '06:00',
          credentialId: seed.credential.id,
          csvMappingTemplateId: importTemplate.id,
        },
      })
      expect(created.statusCode).toBe(201)
      const id = (created.json() as ScheduleBody).data.id
      const cleared = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${id}`,
        headers: seed.headers,
        payload: { csvMappingTemplateId: null },
      })
      expect(cleared.statusCode).toBe(200)
      const dbRow = await testDb.integrationSchedule.findUnique({
        where: { id },
      })
      expect(dbRow?.csvMappingTemplateId).toBeNull()
    } finally {
      await app.close()
    }
  })
})

// ---------------------------------------------------------------------------

describe('schedule lifecycle', () => {
  it('list → update intervalValue → toggle inactive/active → delete', async () => {
    const seed = await seedScenario()
    const app = await buildTestApp()
    try {
      // Create
      const created = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
        payload: {
          name: 'every 15 min',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'interval_minutes',
          intervalValue: 15,
          credentialId: seed.credential.id,
        },
      })
      expect(created.statusCode).toBe(201)
      const createdBody = created.json() as ScheduleBody
      expect(createdBody.data.cronExpression).toBe('*/15 * * * *')

      // List
      const listed = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
      })
      expect(listed.statusCode).toBe(200)
      const listedBody = listed.json() as ScheduleListBody
      expect(listedBody.data).toHaveLength(1)
      expect(listedBody.data[0]?.cronDescription).toBe('Every 15 minutes')
      expect(listedBody.data[0]?.nextRunAt).toBeTruthy()

      mockedUpsert.mockClear()

      // Update intervalValue → cron + scheduler must change.
      const updated = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${createdBody.data.id}`,
        headers: seed.headers,
        payload: { intervalValue: 30 },
      })
      expect(updated.statusCode).toBe(200)
      expect((updated.json() as ScheduleBody).data.cronExpression).toBe(
        '*/30 * * * *',
      )
      expect(mockedUpsert).toHaveBeenCalledTimes(1)
      expect(mockedUpsert.mock.calls[0]?.[1]).toEqual({
        pattern: '*/30 * * * *',
        tz: 'Europe/Berlin',
      })

      mockedUpsert.mockClear()
      mockedRemove.mockClear()

      // Toggle inactive → scheduler removed.
      const off = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${createdBody.data.id}/toggle`,
        headers: seed.headers,
      })
      expect(off.statusCode).toBe(200)
      expect((off.json() as ScheduleBody).data.isActive).toBe(false)
      expect(mockedRemove).toHaveBeenCalledTimes(1)
      expect(mockedRemove.mock.calls[0]?.[0]).toBe(createdBody.data.id)
      expect(mockedUpsert).toHaveBeenCalledTimes(0)

      mockedUpsert.mockClear()

      // Toggle back on → scheduler re-registered with current cron.
      const on = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${seed.integration.id}/schedules/${createdBody.data.id}/toggle`,
        headers: seed.headers,
      })
      expect(on.statusCode).toBe(200)
      expect((on.json() as ScheduleBody).data.isActive).toBe(true)
      expect(mockedUpsert).toHaveBeenCalledTimes(1)
      expect(mockedUpsert.mock.calls[0]?.[1]).toEqual({
        pattern: '*/30 * * * *',
        tz: 'Europe/Berlin',
      })

      mockedRemove.mockClear()

      // Delete → soft-delete + scheduler removed.
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/v1/integrations/${seed.integration.id}/schedules/${createdBody.data.id}`,
        headers: seed.headers,
      })
      expect(deleted.statusCode).toBe(200)
      expect(mockedRemove).toHaveBeenCalledTimes(1)
      const dbRow = await testDb.integrationSchedule.findUnique({
        where: { id: createdBody.data.id },
      })
      expect(dbRow?.deletedAt).not.toBeNull()
      expect(dbRow?.isActive).toBe(false)

      // Listing skips soft-deleted rows.
      const after = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${seed.integration.id}/schedules`,
        headers: seed.headers,
      })
      expect((after.json() as ScheduleListBody).data).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})

// ---------------------------------------------------------------------------

describe('cross-tenant isolation', () => {
  it("tenant A's schedule is invisible and untouchable from tenant B", async () => {
    const a = await seedScenario()
    const b = await seedScenario()
    const app = await buildTestApp()
    try {
      const created = await app.inject({
        method: 'POST',
        url: `/v1/integrations/${a.integration.id}/schedules`,
        headers: a.headers,
        payload: {
          name: 'A daily',
          resourceType: 'stock',
          direction: 'import',
          scheduleType: 'daily',
          timeOfDay: '06:00',
          credentialId: a.credential.id,
        },
      })
      expect(created.statusCode).toBe(201)
      const cBody = created.json() as ScheduleBody

      // B can't list A's integration.
      const listB = await app.inject({
        method: 'GET',
        url: `/v1/integrations/${a.integration.id}/schedules`,
        headers: b.headers,
      })
      expect(listB.statusCode).toBe(404)

      // B can't update A's schedule.
      const patchB = await app.inject({
        method: 'PATCH',
        url: `/v1/integrations/${a.integration.id}/schedules/${cBody.data.id}`,
        headers: b.headers,
        payload: { name: 'hijacked' },
      })
      expect(patchB.statusCode).toBe(404)

      // B can't delete A's schedule.
      const deleteB = await app.inject({
        method: 'DELETE',
        url: `/v1/integrations/${a.integration.id}/schedules/${cBody.data.id}`,
        headers: b.headers,
      })
      expect(deleteB.statusCode).toBe(404)

      // The schedule still exists for A.
      const aStill = await testDb.integrationSchedule.findUnique({
        where: { id: cBody.data.id },
      })
      expect(aStill?.deletedAt).toBeNull()
    } finally {
      await app.close()
    }
  })
})
