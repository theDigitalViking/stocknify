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
  //   Returns the full catalog annotated with per-tenant install state.
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
          isEnabled: true,
          createdAt: true,
        },
      })
      const byKey = new Map<string, (typeof installed)[number]>()
      for (const row of installed) {
        if (row.marketplaceKey) byKey.set(row.marketplaceKey, row)
      }
      const data = MARKETPLACE_CATALOG.map((entry) => {
        const row = byKey.get(entry.key)
        return {
          key: entry.key,
          name: entry.name,
          description: entry.description,
          category: entry.category,
          logoUrl: entry.logoUrl,
          installed: Boolean(row),
          integrationId: row?.id ?? null,
          isEnabled: row?.isEnabled ?? null,
          installedAt: row?.createdAt ?? null,
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
  //   any locked mapping templates defined on the catalog entry.
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
      const conflict = await request.db.integration.findFirst({
        where: {
          tenantId: request.tenantId,
          deletedAt: null,
          marketplaceKey: entry.key,
        },
        select: { id: true },
      })
      if (conflict) {
        return reply.code(409).send({
          error: {
            code: 'ALREADY_INSTALLED',
            message: 'Integration is already installed for this tenant',
          },
        })
      }

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

      const createTemplateOps = (entry.fixedTemplates ?? []).map((t) =>
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

      // Atomic: either the integration + all locked templates land together,
      // or none of them do. Prevents zombie integrations with missing templates.
      const [integration, ...lockedTemplates] = await request.db.$transaction([
        createIntegration,
        ...createTemplateOps,
      ])

      return reply.code(201).send({ data: { integration, lockedTemplates } })
    } catch (err) {
      // Unique-constraint race with a concurrent install collapses into 409.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({
          error: {
            code: 'ALREADY_INSTALLED',
            message: 'Integration is already installed for this tenant',
          },
        })
      }
      request.log.error({ err }, 'marketplace install failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to install integration' } })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /integrations/marketplace/:key/uninstall
  //   Soft-deletes the marketplace integration and all of its locked
  //   mapping templates.
  // -------------------------------------------------------------------------
  app.delete('/integrations/marketplace/:key/uninstall', async (request, reply) => {
    const params = keyParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid marketplace key' } })
    }
    try {
      // Defensive against any pre-unique-constraint duplicates: operate on all
      // matching active rows, not just the first.
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
