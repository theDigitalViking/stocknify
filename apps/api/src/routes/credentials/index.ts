import { Prisma, type PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { testFtpConnection } from '../../integrations/ftp-client.js'
import { testSftpConnection } from '../../integrations/sftp-client.js'
import { decryptCredential, encryptCredential, MASKED_SECRET } from '../../lib/encryption.js'
import { authMiddleware } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

// Connection-test endpoints currently support SFTP/FTP/FTPS only — the credential
// schema's other types (api_key/oauth/webhook/basic_auth) will plug in later.
const TESTABLE_TYPES = ['sftp', 'ftp', 'ftps'] as const
type TestableType = (typeof TESTABLE_TYPES)[number]

const credentialTypeSchema = z.enum(TESTABLE_TYPES)

const uuidSchema = z.string().uuid()

const baseCredentialFields = {
  name: z.string().min(1).max(255),
  credentialType: credentialTypeSchema,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(255),
  password: z.string().max(2048).optional(),
  token: z.string().max(2048).optional(),
  secret: z.string().max(2048).optional(),
  remotePath: z.string().max(1024).optional(),
  integrationId: uuidSchema.optional(),
} as const

const createCredentialBodySchema = z.object(baseCredentialFields)

// PATCH allows clearing `password` / `token` / `secret` by sending `null`;
// omitting the field leaves the existing encrypted value untouched.
const updateCredentialBodySchema = z.object({
  name: baseCredentialFields.name.optional(),
  credentialType: baseCredentialFields.credentialType.optional(),
  host: baseCredentialFields.host.optional(),
  port: baseCredentialFields.port,
  username: baseCredentialFields.username.optional(),
  password: z.union([z.string().max(2048), z.null()]).optional(),
  token: z.union([z.string().max(2048), z.null()]).optional(),
  secret: z.union([z.string().max(2048), z.null()]).optional(),
  remotePath: z.union([z.string().max(1024), z.null()]).optional(),
  integrationId: z.union([uuidSchema, z.null()]).optional(),
})

const idParamSchema = z.object({ id: uuidSchema })

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

type CredentialRow = {
  id: string
  integrationId: string | null
  credentialType: string
  name: string
  host: string | null
  port: number | null
  username: string | null
  password: string | null
  token: string | null
  secret: string | null
  remotePath: string | null
  additionalAttributes: Prisma.JsonValue
  isActive: boolean
  lastVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface MaskedCredential {
  id: string
  integrationId: string | null
  credentialType: string
  name: string
  host: string | null
  port: number | null
  username: string | null
  password: string | null
  token: string | null
  secret: string | null
  remotePath: string | null
  additionalAttributes: Prisma.JsonValue
  isActive: boolean
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

// Replace the encrypted blob with a stable mask so the API never leaks
// ciphertext or plaintext lengths. `null` distinguishes "not set" from
// "set but masked" so the UI can render an empty vs filled input.
function maskCredentialField(value: string | null): string | null {
  return value === null ? null : MASKED_SECRET
}

function maskCredential(row: CredentialRow): MaskedCredential {
  return {
    id: row.id,
    integrationId: row.integrationId,
    credentialType: row.credentialType,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    password: maskCredentialField(row.password),
    token: maskCredentialField(row.token),
    secret: maskCredentialField(row.secret),
    remotePath: row.remotePath,
    additionalAttributes: row.additionalAttributes,
    isActive: row.isActive,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function defaultPortForType(type: TestableType): number {
  return type === 'sftp' ? 22 : 21
}

async function ensureIntegrationBelongsToTenant(
  db: PrismaClient,
  tenantId: string,
  integrationId: string,
): Promise<boolean> {
  const found = await db.integration.findFirst({
    where: { id: integrationId, tenantId, deletedAt: null },
    select: { id: true },
  })
  return found !== null
}

// ---------------------------------------------------------------------------
// Connection test runner — shared by `POST /:id/test` and `POST /test`.
// ---------------------------------------------------------------------------

interface ConnectionTestInput {
  credentialType: TestableType
  host: string
  port: number
  username: string
  password?: string
}

async function runConnectionTest(
  input: ConnectionTestInput,
): Promise<{ success: boolean; error?: string }> {
  if (input.credentialType === 'sftp') {
    return testSftpConnection({
      host: input.host,
      port: input.port,
      username: input.username,
      ...(input.password !== undefined ? { password: input.password } : {}),
    })
  }
  return testFtpConnection({
    host: input.host,
    port: input.port,
    username: input.username,
    ...(input.password !== undefined ? { password: input.password } : {}),
    secure: input.credentialType === 'ftps',
  })
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function credentialsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)
  // Credentials carry secret material and outbound network capability; restrict
  // to admins (Codex review fix — original cycle exposed mutation + connection
  // tests to viewer/manager since the userRole check was missing).
  app.addHook('preHandler', requireRole('admin'))

  // -------------------------------------------------------------------------
  // GET /credentials — list with active-schedule usageCount
  // -------------------------------------------------------------------------
  app.get('/credentials', async (request, reply) => {
    const rows = await request.db.integrationCredential.findMany({
      where: { tenantId: request.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    const counts = rows.length === 0
      ? new Map<string, number>()
      : await request.db.integrationSchedule
          .groupBy({
            by: ['credentialId'],
            where: {
              tenantId: request.tenantId,
              deletedAt: null,
              credentialId: { in: rows.map((r) => r.id) },
            },
            _count: { _all: true },
          })
          .then((groups) => {
            const map = new Map<string, number>()
            for (const g of groups) {
              if (g.credentialId !== null) {
                map.set(g.credentialId, g._count._all)
              }
            }
            return map
          })

    return reply.send({
      data: rows.map((row) => ({
        ...maskCredential(row),
        usageCount: counts.get(row.id) ?? 0,
      })),
    })
  })

  // -------------------------------------------------------------------------
  // POST /credentials/test — connection test for unsaved credentials
  // (registered BEFORE `:id/test` so Fastify routes `test` to this handler).
  // -------------------------------------------------------------------------
  app.post('/credentials/test', async (request, reply) => {
    const parsed = createCredentialBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      })
    }
    const data = parsed.data
    const port = data.port ?? defaultPortForType(data.credentialType)
    const result = await runConnectionTest({
      credentialType: data.credentialType,
      host: data.host,
      port,
      username: data.username,
      ...(data.password !== undefined ? { password: data.password } : {}),
    })
    return reply.send({ data: result })
  })

  // -------------------------------------------------------------------------
  // POST /credentials — create
  // -------------------------------------------------------------------------
  app.post('/credentials', async (request, reply) => {
    const parsed = createCredentialBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      })
    }
    const data = parsed.data

    if (data.integrationId !== undefined) {
      const ok = await ensureIntegrationBelongsToTenant(
        request.db,
        request.tenantId,
        data.integrationId,
      )
      if (!ok) {
        return reply.code(404).send({
          error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
        })
      }
    }

    const port = data.port ?? defaultPortForType(data.credentialType)

    const createData: Prisma.IntegrationCredentialUncheckedCreateInput = {
      tenantId: request.tenantId,
      name: data.name,
      credentialType: data.credentialType,
      host: data.host,
      port,
      username: data.username,
      ...(data.integrationId !== undefined ? { integrationId: data.integrationId } : {}),
      ...(data.remotePath !== undefined ? { remotePath: data.remotePath } : {}),
      ...(data.password !== undefined ? { password: encryptCredential(data.password) } : {}),
      ...(data.token !== undefined ? { token: encryptCredential(data.token) } : {}),
      ...(data.secret !== undefined ? { secret: encryptCredential(data.secret) } : {}),
    }

    const created = await request.db.integrationCredential.create({ data: createData })

    return reply.code(201).send({ data: maskCredential(created) })
  })

  // -------------------------------------------------------------------------
  // PATCH /credentials/:id — update
  // -------------------------------------------------------------------------
  app.patch('/credentials/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid credential id' },
      })
    }
    const body = updateCredentialBodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: body.error.message },
      })
    }

    const existing = await request.db.integrationCredential.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found' },
      })
    }

    const data = body.data

    // integrationId: if explicitly set to a UUID, validate ownership.
    if (typeof data.integrationId === 'string') {
      const ok = await ensureIntegrationBelongsToTenant(
        request.db,
        request.tenantId,
        data.integrationId,
      )
      if (!ok) {
        return reply.code(404).send({
          error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
        })
      }
    }

    const updateData: Prisma.IntegrationCredentialUncheckedUpdateInput = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.credentialType !== undefined) updateData.credentialType = data.credentialType
    if (data.host !== undefined) updateData.host = data.host
    if (data.port !== undefined) updateData.port = data.port
    if (data.username !== undefined) updateData.username = data.username
    if (data.remotePath !== undefined) updateData.remotePath = data.remotePath
    if (data.integrationId !== undefined) updateData.integrationId = data.integrationId
    // Sensitive fields: `null` clears, string re-encrypts, undefined leaves alone.
    if (data.password !== undefined) {
      updateData.password = data.password === null ? null : encryptCredential(data.password)
    }
    if (data.token !== undefined) {
      updateData.token = data.token === null ? null : encryptCredential(data.token)
    }
    if (data.secret !== undefined) {
      updateData.secret = data.secret === null ? null : encryptCredential(data.secret)
    }

    const updated = await request.db.integrationCredential.update({
      where: { id: params.data.id },
      data: updateData,
    })

    return reply.send({ data: maskCredential(updated) })
  })

  // -------------------------------------------------------------------------
  // DELETE /credentials/:id — hard-delete (DECISIONS 2026-05-07)
  //
  // The active-schedule check + delete run inside a single SERIALIZABLE
  // transaction so a concurrent INSERT into integration_schedules cannot
  // bypass the in-use guard. Postgres surfaces the conflict as P2034
  // (serialization failure); we retry once, then surface 503.
  //
  // Hard delete (not soft) — credentials carry sensitive auth material; when
  // the operator removes them they're gone from the DB, no `deletedAt`
  // tombstone. The `deletedAt` column remains on the schema for now but is
  // no longer written to by this route.
  // -------------------------------------------------------------------------
  app.delete('/credentials/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid credential id' },
      })
    }

    const existing = await request.db.integrationCredential.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found' },
      })
    }

    type DeleteOutcome =
      | { kind: 'deleted' }
      | { kind: 'inUse'; count: number }

    const credentialId = params.data.id
    const tenantId = request.tenantId
    const MAX_RETRIES = 1

    const runDelete = async (): Promise<DeleteOutcome> =>
      request.db.$transaction(
        async (tx) => {
          const activeSchedules = await tx.integrationSchedule.count({
            where: { tenantId, credentialId, deletedAt: null },
          })
          // Cycle 5-A.5: integrations now also reference a default credential
          // directly (Integration.credentialId). Both reference paths block
          // deletion; the user-visible 409 sums them so a single message
          // covers "this credential is in use" regardless of path.
          const referencingIntegrations = await tx.integration.count({
            where: { tenantId, credentialId, deletedAt: null },
          })
          const totalReferences = activeSchedules + referencingIntegrations
          if (totalReferences > 0) {
            return { kind: 'inUse', count: totalReferences }
          }
          await tx.integrationCredential.delete({
            where: { id: credentialId },
          })
          return { kind: 'deleted' }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )

    let outcome: DeleteOutcome | undefined
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        outcome = await runDelete()
        break
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034' &&
          attempt < MAX_RETRIES
        ) {
          request.log.warn(
            { credentialId, attempt: attempt + 1 },
            'Serialization conflict on credential delete; retrying',
          )
          continue
        }
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034'
        ) {
          request.log.warn(
            { credentialId },
            'Serialization conflict on credential delete; retries exhausted',
          )
          return reply.code(503).send({
            error: {
              code: 'SERIALIZATION_FAILED',
              message: 'Concurrent change detected — please retry',
            },
          })
        }
        throw err
      }
    }

    if (!outcome) {
      // Defensive — the loop above always assigns or throws.
      throw new Error('credential delete: outcome unset after retry loop')
    }

    if (outcome.kind === 'inUse') {
      return reply.code(409).send({
        error: {
          code: 'CREDENTIAL_IN_USE',
          message: `Cannot delete: ${String(outcome.count)} active reference(s) to this credential`,
        },
      })
    }

    return reply.send({ data: { id: credentialId, deleted: true } })
  })

  // -------------------------------------------------------------------------
  // POST /credentials/:id/test — connection test for saved credential
  // -------------------------------------------------------------------------
  app.post('/credentials/:id/test', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid credential id' },
      })
    }

    const credential = await request.db.integrationCredential.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
    })
    if (!credential) {
      return reply.code(404).send({
        error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found' },
      })
    }

    if (!isTestableType(credential.credentialType)) {
      return reply.code(400).send({
        error: {
          code: 'CREDENTIAL_TYPE_NOT_TESTABLE',
          message: `Connection test not supported for type "${credential.credentialType}"`,
        },
      })
    }
    if (credential.host === null || credential.username === null) {
      return reply.code(400).send({
        error: {
          code: 'CREDENTIAL_INCOMPLETE',
          message: 'Credential is missing host or username',
        },
      })
    }

    const port = credential.port ?? defaultPortForType(credential.credentialType)

    let plainPassword: string | undefined
    if (credential.password !== null) {
      try {
        plainPassword = decryptCredential(credential.password)
      } catch (err) {
        request.log.error({ err, credentialId: credential.id }, 'Failed to decrypt credential password')
        return reply.code(500).send({
          error: { code: 'CREDENTIAL_DECRYPT_FAILED', message: 'Failed to decrypt credential' },
        })
      }
    }

    const result = await runConnectionTest({
      credentialType: credential.credentialType,
      host: credential.host,
      port,
      username: credential.username,
      ...(plainPassword !== undefined ? { password: plainPassword } : {}),
    })

    if (result.success) {
      await request.db.integrationCredential.update({
        where: { id: credential.id },
        data: { lastVerifiedAt: new Date() },
      })
    }

    return reply.send({ data: result })
  })
}

function isTestableType(value: string): value is TestableType {
  return (TESTABLE_TYPES as readonly string[]).includes(value)
}
