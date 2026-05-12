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

const updateIntegrationSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    name: z.string().min(1).max(200).optional(),
    config: z.record(z.unknown()).optional(),
  })
  .strict()

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
    try {
      const createIntegration = request.db.integration.create({
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

      // Locked templates are tenant+marketplaceKey-scoped, not per-install.
      // Re-installing the same key when locked templates already exist must
      // not duplicate them — skip template creation when at least one is
      // already present for this (tenant, marketplaceKey).
      const fixedTemplates = entry.fixedTemplates ?? []
      const existingLocked =
        fixedTemplates.length > 0
          ? await request.db.csvMappingTemplate.findFirst({
              where: {
                tenantId: request.tenantId,
                deletedAt: null,
                isLocked: true,
                marketplaceKey: entry.key,
              },
              select: { id: true },
            })
          : null

      const createTemplateOps = existingLocked
        ? []
        : fixedTemplates.map((t) =>
            request.db.csvMappingTemplate.create({
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

      // Atomic: either the integration + any newly-needed locked templates
      // land together, or none of them do.
      const [integration, ...lockedTemplates] = await request.db.$transaction([
        createIntegration,
        ...createTemplateOps,
      ])

      return reply.code(201).send({ data: { integration, lockedTemplates } })
    } catch (err) {
      request.log.error({ err }, 'marketplace install failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to install integration' } })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /integrations/marketplace/:key/uninstall
  //   Deprecated bulk uninstall — soft-deletes ALL active rows for the key
  //   and tears down locked mapping templates. Kept for backwards compat;
  //   the marketplace UI now uses DELETE /integrations/:id for per-instance
  //   uninstall. New callers should target a specific integrationId.
  // -------------------------------------------------------------------------
  app.delete('/integrations/marketplace/:key/uninstall', async (request, reply) => {
    const params = keyParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid marketplace key' } })
    }
    try {
      const existing = await request.db.integration.findMany({
        where: {
          tenantId: request.tenantId,
          deletedAt: null,
          marketplaceKey: params.data.key,
        },
        select: { id: true },
      })
      if (existing.length === 0) {
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Integration is not installed' } })
      }
      const now = new Date()
      await request.db.$transaction([
        request.db.integration.updateMany({
          where: {
            tenantId: request.tenantId,
            deletedAt: null,
            marketplaceKey: params.data.key,
          },
          data: { deletedAt: now },
        }),
        request.db.csvMappingTemplate.updateMany({
          where: {
            tenantId: request.tenantId,
            deletedAt: null,
            isLocked: true,
            marketplaceKey: params.data.key,
          },
          data: { deletedAt: now },
        }),
      ])
      return reply.code(204).send()
    } catch (err) {
      request.log.error({ err }, 'marketplace uninstall failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to uninstall integration' } })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /integrations/:id
  //   Per-instance soft-delete. Tears down locked mapping templates for the
  //   marketplace key only when this was the LAST active installation of
  //   that key — otherwise other installs would lose their templates.
  // -------------------------------------------------------------------------
  app.delete('/integrations/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid integration ID' } })
    }
    try {
      const existing = await request.db.integration.findFirst({
        where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
        select: { id: true, marketplaceKey: true },
      })
      if (!existing) {
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } })
      }

      const now = new Date()
      const ops: Prisma.PrismaPromise<unknown>[] = [
        request.db.integration.update({
          where: { id: existing.id },
          data: { deletedAt: now },
        }),
      ]

      // Marketplace integrations: tear down locked templates only when this
      // was the last surviving install of the key. Other installs of the
      // same key keep the shared templates alive.
      if (existing.marketplaceKey) {
        const siblings = await request.db.integration.count({
          where: {
            tenantId: request.tenantId,
            deletedAt: null,
            marketplaceKey: existing.marketplaceKey,
            id: { not: existing.id },
          },
        })
        if (siblings === 0) {
          ops.push(
            request.db.csvMappingTemplate.updateMany({
              where: {
                tenantId: request.tenantId,
                deletedAt: null,
                isLocked: true,
                marketplaceKey: existing.marketplaceKey,
              },
              data: { deletedAt: now },
            }),
          )
        }
      }

      await request.db.$transaction(ops)
      return reply.code(204).send()
    } catch (err) {
      request.log.error({ err }, 'integration delete failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete integration' } })
    }
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

      if (!isMarketplace && parsed.data.isEnabled !== undefined) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'isEnabled can only be changed on marketplace integrations',
          },
        })
      }
      if (isMarketplace && (parsed.data.name !== undefined || parsed.data.config !== undefined)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name and config are immutable on marketplace integrations',
          },
        })
      }

      const data: Prisma.IntegrationUpdateInput = {}
      if (parsed.data.isEnabled !== undefined) data.isEnabled = parsed.data.isEnabled
      if (parsed.data.name !== undefined) data.name = parsed.data.name
      if (parsed.data.config !== undefined) {
        data.config = parsed.data.config as unknown as Prisma.InputJsonObject
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
