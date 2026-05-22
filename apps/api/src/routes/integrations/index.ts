import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { MARKETPLACE_CATALOG, getCatalogEntry } from '../../lib/marketplace-catalog.js'
import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  category: z.enum(['shop', 'erp', 'warehouse', 'fulfiller']).optional(),
  type: z.enum(['marketplace', 'csv']).optional(),
})

// Cycle 5-C: subdir is a folder NAME, not a path. Reject slashes / dots /
// whitespace so the operator can't accidentally place archives outside the
// expected `<source-dir>/<subdir>/<YYYY-MM>/` layout.
const SUBDIR_PATTERN = /^[A-Za-z0-9_-]+$/

const updateIntegrationSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    name: z.string().min(1).max(200).optional(),
    config: z.record(z.unknown()).optional(),
    credentialId: z.string().uuid().nullable().optional(),
    csvMappingTemplateId: z.string().uuid().nullable().optional(),
    // Cycle 5-C — post-import handling fields.
    postImportAction: z.enum(['delete', 'archive']).optional(),
    archiveSubdir: z.string().min(1).max(64).regex(SUBDIR_PATTERN).optional(),
    maxImportRetries: z.number().int().min(0).max(10).optional(),
    failedAction: z.enum(['delete', 'archive']).optional(),
    failedSubdir: z.string().min(1).max(64).regex(SUBDIR_PATTERN).optional(),
    // Cycle 5-E — sub-directory under the credential's remote path; null
    // clears the override so listings fall back to credential.remotePath.
    // Paths are opaque strings (spaces, unicode, dots all allowed); only
    // length is constrained here.
    importPath: z.string().max(512).nullable().optional(),
  })
  .strict()

// Cycle 5-A.5: marketplace keys that allow rename via PATCH. Other marketplace
// integrations (Shopify, Hive, Byrd, …) still reject `name` until a future
// cycle widens the gate further.
const RENAMABLE_MARKETPLACE_KEYS = new Set(['sftp', 'ftp', 'ftps'])

// Credential types that may be set as a default on an Integration.
const SFTP_FAMILY_CREDENTIAL_TYPES = new Set(['sftp', 'ftp', 'ftps'])

const installBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
  })
  .strict()

const keyParamSchema = z.object({ key: z.string().min(1).max(100) })
const idParamSchema = z.object({ id: z.string().uuid() })

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // -------------------------------------------------------------------------
  // GET /integrations/marketplace/catalog
  //   Returns the public catalog (static names + descriptions from
  //   MARKETPLACE_CATALOG) annotated with per-tenant install state. Multiple
  //   installations per key are supported and returned in `installations[]`.
  //   Internal-only entries (e.g. SFTP) are excluded — they have their own UI.
  // -------------------------------------------------------------------------
  app.get('/integrations/marketplace/catalog', async (request, reply) => {
    try {
      const installed = await request.db.integration.findMany({
        where: {
          tenantId: request.tenantId,
          deletedAt: null,
          marketplaceKey: { not: null },
        },
        select: {
          id: true,
          marketplaceKey: true,
          name: true,
          isEnabled: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      const byKey = new Map<string, (typeof installed)[number][]>()
      for (const row of installed) {
        if (!row.marketplaceKey) continue
        const bucket = byKey.get(row.marketplaceKey) ?? []
        bucket.push(row)
        byKey.set(row.marketplaceKey, bucket)
      }
      const data = MARKETPLACE_CATALOG.map((entry) => {
        const rows = byKey.get(entry.key) ?? []
        return {
          key: entry.key,
          // Static catalog names/descriptions — never overridden by the
          // tenant's instance name. Instance names live in `installations[]`.
          name: entry.name,
          description: entry.description,
          category: entry.category,
          logoUrl: entry.logoUrl,
          installCount: rows.length,
          installations: rows.map((row) => ({
            integrationId: row.id,
            instanceName: row.name,
            isEnabled: row.isEnabled,
            installedAt: row.createdAt,
          })),
        }
      })
      return reply.send({ data })
    } catch (err) {
      request.log.error({ err }, 'marketplace catalog list failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list marketplace catalog' } })
    }
  })

  // -------------------------------------------------------------------------
  // GET /integrations
  //   List all non-deleted integrations for the tenant, optionally filtered.
  //   type=marketplace  → marketplaceKey IS NOT NULL
  //   type=csv          → marketplaceKey IS NULL
  // -------------------------------------------------------------------------
  app.get('/integrations', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    }
    try {
      const where: Prisma.IntegrationWhereInput = {
        tenantId: request.tenantId,
        deletedAt: null,
        ...(parsed.data.category ? { category: parsed.data.category } : {}),
        ...(parsed.data.type === 'marketplace' ? { marketplaceKey: { not: null } } : {}),
        ...(parsed.data.type === 'csv' ? { marketplaceKey: null } : {}),
      }
      const integrations = await request.db.integration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })
      return reply.send({ data: integrations })
    } catch (err) {
      request.log.error({ err }, 'integrations list failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list integrations' } })
    }
  })

  // -------------------------------------------------------------------------
  // POST /integrations/marketplace/:key/install
  //   Installs a marketplace integration for the current tenant and creates
  //   any locked mapping templates defined on the catalog entry. Multiple
  //   installations of the same key are allowed — each call creates a fresh
  //   integration row.
  //
  //   Concurrency model (Cycle 4-A Codex review fix): the read+write must be
  //   atomic against concurrent installs and deletes on the same
  //   (tenant, marketplace_key) bucket. Runs inside a SERIALIZABLE
  //   transaction with bounded retry on P2034 (matches the credential-delete
  //   pattern). Locked-template uniqueness is also enforced at the DB level
  //   via `csv_mapping_templates_locked_unique` as a defense-in-depth net.
  // -------------------------------------------------------------------------
  app.post('/integrations/marketplace/:key/install', async (request, reply) => {
    const params = keyParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid marketplace key' } })
    }
    const entry = getCatalogEntry(params.data.key)
    if (!entry) {
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Marketplace integration not found' } })
    }
    // Body is optional. When present, only `name` is accepted; whitespace-only
    // and missing values both fall through to the catalog default.
    const bodyRaw = request.body
    const parsedBody = bodyRaw === undefined || bodyRaw === null
      ? { success: true as const, data: {} as { name?: string } }
      : installBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsedBody.error.message } })
    }
    const resolvedName = parsedBody.data.name?.trim() || entry.name
    const fixedTemplates = entry.fixedTemplates ?? []
    const MAX_RETRIES = 1

    type InstallResult = {
      integration: Prisma.IntegrationGetPayload<Record<string, never>>
      lockedTemplates: Prisma.CsvMappingTemplateGetPayload<Record<string, never>>[]
    }

    const runInstall = async (): Promise<InstallResult> =>
      request.db.$transaction(
        async (tx) => {
          const integration = await tx.integration.create({
            data: {
              tenantId: request.tenantId,
              type: entry.key,
              name: resolvedName,
              marketplaceKey: entry.key,
              logoUrl: entry.logoUrl,
              category: entry.category,
              status: 'pending',
              isEnabled: true,
              credentials: {} as Prisma.InputJsonObject,
              config: {} as Prisma.InputJsonObject,
            },
          })

          // Locked templates are tenant+marketplace_key-scoped, not
          // per-install. Re-installing the same key after a sibling already
          // provisioned the catalog's fixed templates must not duplicate
          // them. The check-and-create is safe inside the SERIALIZABLE
          // transaction; the `csv_mapping_templates_locked_unique` partial
          // unique index is the DB-level backstop.
          let lockedTemplates: Prisma.CsvMappingTemplateGetPayload<Record<string, never>>[] = []
          if (fixedTemplates.length > 0) {
            const existing = await tx.csvMappingTemplate.findMany({
              where: {
                tenantId: request.tenantId,
                deletedAt: null,
                isLocked: true,
                marketplaceKey: entry.key,
              },
              orderBy: { createdAt: 'asc' },
            })
            if (existing.length > 0) {
              lockedTemplates = existing
            } else {
              const created: Prisma.CsvMappingTemplateGetPayload<Record<string, never>>[] = []
              for (const t of fixedTemplates) {
                created.push(
                  await tx.csvMappingTemplate.create({
                    data: {
                      tenantId: request.tenantId,
                      name: t.name,
                      direction: t.direction,
                      resourceType: t.resourceType,
                      delimiter: t.delimiter,
                      encoding: t.encoding,
                      hasHeaderRow: t.hasHeaderRow,
                      columnMappings: t.columnMappings as unknown as Prisma.InputJsonValue,
                      defaultValues: t.defaultValues as unknown as Prisma.InputJsonObject,
                      isLocked: true,
                      marketplaceKey: entry.key,
                    },
                  }),
                )
              }
              lockedTemplates = created
            }
          }

          return { integration, lockedTemplates }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )

    let result: InstallResult | undefined
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await runInstall()
        break
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034' &&
          attempt < MAX_RETRIES
        ) {
          request.log.warn(
            { marketplaceKey: entry.key, attempt: attempt + 1 },
            'Serialization conflict on marketplace install; retrying',
          )
          continue
        }
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034'
        ) {
          request.log.warn(
            { marketplaceKey: entry.key },
            'Serialization conflict on marketplace install; retries exhausted',
          )
          return reply.code(503).send({
            error: {
              code: 'SERIALIZATION_FAILED',
              message: 'Concurrent change detected — please retry',
            },
          })
        }
        // Belt-and-suspenders: the partial unique index can still reject a
        // duplicate locked-template insert if the SERIALIZABLE protection
        // is bypassed (e.g. downgraded isolation in a future change). Map
        // that surface to the same retry-friendly 503.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < MAX_RETRIES
        ) {
          request.log.warn(
            { marketplaceKey: entry.key, attempt: attempt + 1 },
            'Locked-template unique conflict on install; retrying',
          )
          continue
        }
        request.log.error({ err }, 'marketplace install failed')
        return reply
          .code(500)
          .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to install integration' } })
      }
    }
    if (!result) {
      // Defensive — the loop above always assigns or returns.
      throw new Error('marketplace install: result unset after retry loop')
    }
    return reply.code(201).send({
      data: { integration: result.integration, lockedTemplates: result.lockedTemplates },
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /integrations/marketplace/:key/uninstall
  //   Retired in Cycle 4-A. Under multi-install this would silently
  //   soft-delete EVERY active installation of the key in a single call,
  //   which is data-loss-shaped behaviour for any caller that hasn't been
  //   updated. Callers must use DELETE /v1/integrations/:id to uninstall a
  //   specific installation by ID.
  // -------------------------------------------------------------------------
  app.delete('/integrations/marketplace/:key/uninstall', async (_request, reply) => {
    return reply.code(410).send({
      error: {
        code: 'ENDPOINT_REMOVED',
        message:
          'Bulk key-scoped uninstall has been retired. Use DELETE /v1/integrations/:id to uninstall a specific installation by ID.',
      },
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /integrations/:id
  //   Per-instance soft-delete. Tears down locked mapping templates for the
  //   marketplace key only when this was the LAST active installation of
  //   that key — otherwise other installs would lose their templates.
  //
  //   Concurrency model (Cycle 4-A Codex review fix): the sibling-count
  //   read and the integration/template writes run inside one SERIALIZABLE
  //   transaction with bounded retry on P2034. Without this, a concurrent
  //   install racing with a delete could leave the surviving installs
  //   without the locked templates they expect.
  // -------------------------------------------------------------------------
  app.delete('/integrations/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid integration ID' } })
    }

    type DeleteOutcome = { kind: 'deleted' } | { kind: 'notFound' }

    const integrationId = params.data.id
    const tenantId = request.tenantId
    const MAX_RETRIES = 1

    const runDelete = async (): Promise<DeleteOutcome> =>
      request.db.$transaction(
        async (tx) => {
          const existing = await tx.integration.findFirst({
            where: { id: integrationId, tenantId, deletedAt: null },
            select: { id: true, marketplaceKey: true },
          })
          if (!existing) {
            return { kind: 'notFound' }
          }
          const now = new Date()
          await tx.integration.update({
            where: { id: existing.id },
            data: { deletedAt: now },
          })
          if (existing.marketplaceKey) {
            const siblings = await tx.integration.count({
              where: {
                tenantId,
                deletedAt: null,
                marketplaceKey: existing.marketplaceKey,
                id: { not: existing.id },
              },
            })
            if (siblings === 0) {
              await tx.csvMappingTemplate.updateMany({
                where: {
                  tenantId,
                  deletedAt: null,
                  isLocked: true,
                  marketplaceKey: existing.marketplaceKey,
                },
                data: { deletedAt: now },
              })
            }
          }
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
            { integrationId, attempt: attempt + 1 },
            'Serialization conflict on integration delete; retrying',
          )
          continue
        }
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034'
        ) {
          request.log.warn(
            { integrationId },
            'Serialization conflict on integration delete; retries exhausted',
          )
          return reply.code(503).send({
            error: {
              code: 'SERIALIZATION_FAILED',
              message: 'Concurrent change detected — please retry',
            },
          })
        }
        request.log.error({ err }, 'integration delete failed')
        return reply
          .code(500)
          .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete integration' } })
      }
    }
    if (!outcome) {
      throw new Error('integration delete: outcome unset after retry loop')
    }
    if (outcome.kind === 'notFound') {
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } })
    }
    return reply.code(204).send()
  })

  // -------------------------------------------------------------------------
  // GET /integrations/:id
  //   Always returns { integration, lockedTemplates } — lockedTemplates is
  //   empty for non-marketplace integrations.
  // -------------------------------------------------------------------------
  app.get('/integrations/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid integration ID' } })
    }
    try {
      const integration = await request.db.integration.findFirst({
        where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!integration) {
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } })
      }
      const lockedTemplates = integration.marketplaceKey
        ? await request.db.csvMappingTemplate.findMany({
            where: {
              tenantId: request.tenantId,
              deletedAt: null,
              isLocked: true,
              marketplaceKey: integration.marketplaceKey,
            },
            orderBy: { createdAt: 'asc' },
          })
        : []
      return reply.send({ data: { integration, lockedTemplates } })
    } catch (err) {
      request.log.error({ err }, 'integration detail failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load integration' } })
    }
  })

  // -------------------------------------------------------------------------
  // PATCH /integrations/:id
  //   Marketplace integrations: only isEnabled is mutable here.
  //   CSV / non-marketplace integrations: name and config are mutable;
  //   isEnabled and marketplaceKey are frozen.
  // -------------------------------------------------------------------------
  app.patch('/integrations/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid integration ID' } })
    }
    const parsed = updateIntegrationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    }
    try {
      const existing = await request.db.integration.findFirst({
        where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } })
      }

      const isMarketplace = existing.marketplaceKey !== null
      const isRenamableMarketplace =
        isMarketplace &&
        existing.marketplaceKey !== null &&
        RENAMABLE_MARKETPLACE_KEYS.has(existing.marketplaceKey)

      if (!isMarketplace && parsed.data.isEnabled !== undefined) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'isEnabled can only be changed on marketplace integrations',
          },
        })
      }
      // Cycle 5-A.5: narrow the rename gate so SFTP/FTP/FTPS marketplace
      // entries can be renamed; others stay locked. `config` stays immutable
      // for ALL marketplace integrations.
      if (
        isMarketplace &&
        parsed.data.name !== undefined &&
        !isRenamableMarketplace
      ) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name is immutable on this marketplace integration',
          },
        })
      }
      if (isMarketplace && parsed.data.config !== undefined) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'config is immutable on marketplace integrations',
          },
        })
      }

      // Cycle 5-A.5: validate credentialId when non-null.
      if (parsed.data.credentialId !== undefined && parsed.data.credentialId !== null) {
        const credential = await request.db.integrationCredential.findFirst({
          where: {
            id: parsed.data.credentialId,
            tenantId: request.tenantId,
            deletedAt: null,
          },
          select: { id: true, isActive: true, credentialType: true, integrationId: true },
        })
        if (!credential) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_CREDENTIAL',
              message: 'Credential not found in this tenant',
            },
          })
        }
        if (!credential.isActive) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_CREDENTIAL',
              message: 'Credential is not active',
            },
          })
        }
        if (!SFTP_FAMILY_CREDENTIAL_TYPES.has(credential.credentialType)) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_CREDENTIAL',
              message: 'Credential type must be sftp, ftp, or ftps',
            },
          })
        }
        // Integration-bound credentials must match this integration (reusable
        // credentials have integrationId = null and pass automatically).
        if (credential.integrationId !== null && credential.integrationId !== params.data.id) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_CREDENTIAL',
              message: 'Credential is bound to a different integration',
            },
          })
        }
      }

      // Cycle 5-A.5: validate csvMappingTemplateId when non-null.
      if (parsed.data.csvMappingTemplateId !== undefined && parsed.data.csvMappingTemplateId !== null) {
        const template = await request.db.csvMappingTemplate.findFirst({
          where: {
            id: parsed.data.csvMappingTemplateId,
            tenantId: request.tenantId,
            deletedAt: null,
          },
          select: { id: true, direction: true, resourceType: true },
        })
        if (!template) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_MAPPING_TEMPLATE',
              message: 'Mapping template not found in this tenant',
            },
          })
        }
        if (template.direction !== 'import') {
          return reply.code(400).send({
            error: {
              code: 'INVALID_MAPPING_TEMPLATE',
              message: 'Mapping template must be an import template',
            },
          })
        }
        if (template.resourceType !== 'stock') {
          return reply.code(400).send({
            error: {
              code: 'INVALID_MAPPING_TEMPLATE',
              message: 'Mapping template must target stock',
            },
          })
        }
      }

      const data: Prisma.IntegrationUpdateInput = {}
      if (parsed.data.isEnabled !== undefined) data.isEnabled = parsed.data.isEnabled
      if (parsed.data.name !== undefined) data.name = parsed.data.name
      if (parsed.data.config !== undefined) {
        data.config = parsed.data.config as unknown as Prisma.InputJsonObject
      }
      if (parsed.data.credentialId !== undefined) {
        data.credential =
          parsed.data.credentialId === null
            ? { disconnect: true }
            : { connect: { id: parsed.data.credentialId } }
      }
      if (parsed.data.csvMappingTemplateId !== undefined) {
        data.csvMappingTemplate =
          parsed.data.csvMappingTemplateId === null
            ? { disconnect: true }
            : { connect: { id: parsed.data.csvMappingTemplateId } }
      }
      // Cycle 5-C — post-import handling fields. All are NOT NULL with
      // defaults at the DB level, so PATCH only ever transitions between
      // valid values. The Zod schema already validated enum / range /
      // pattern, so we pass them through directly.
      if (parsed.data.postImportAction !== undefined) {
        data.postImportAction = parsed.data.postImportAction
      }
      if (parsed.data.archiveSubdir !== undefined) {
        data.archiveSubdir = parsed.data.archiveSubdir
      }
      if (parsed.data.maxImportRetries !== undefined) {
        data.maxImportRetries = parsed.data.maxImportRetries
      }
      if (parsed.data.failedAction !== undefined) {
        data.failedAction = parsed.data.failedAction
      }
      if (parsed.data.failedSubdir !== undefined) {
        data.failedSubdir = parsed.data.failedSubdir
      }
      // Cycle 5-E — importPath is a nullable scalar; explicit null clears.
      if (parsed.data.importPath !== undefined) {
        data.importPath = parsed.data.importPath
      }

      if (Object.keys(data).length === 0) {
        return reply.send({ data: existing })
      }

      const updated = await request.db.integration.update({
        where: { id: params.data.id },
        data,
      })
      return reply.send({ data: updated })
    } catch (err) {
      request.log.error({ err }, 'integration update failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update integration' } })
    }
  })
}
