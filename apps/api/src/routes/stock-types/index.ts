import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// Strip undefined values so Prisma update() is happy under exactOptionalPropertyTypes
function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

import { createStockTypeDefinitionSchema } from '@stocknify/shared'

import { authMiddleware } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// Only label, color, and sort_order can be updated on a custom stock type
const updateStockTypeSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sortOrder: z.number().int().nonnegative().optional(),
})

export async function stockTypesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // GET /stock-types — only types relevant to this tenant:
  //   (a) system defaults (tenant_id IS NULL) that this tenant actually has
  //       stock rows for — integrations dictate which types populate, so
  //       unused system defaults would be noise in filter dropdowns
  //   (b) the tenant's own custom types (always returned, even if unused yet)
  app.get('/stock-types', async (request, reply) => {
    try {
      const usedStockTypes = await request.db.stockLevel.findMany({
        where: { tenantId: request.tenantId },
        select: { stockType: true },
        distinct: ['stockType'],
      })
      const usedKeys = usedStockTypes.map((s) => s.stockType)

      const stockTypes = await request.db.stockTypeDefinition.findMany({
        where: {
          OR: [
            { tenantId: null, key: { in: usedKeys } },
            { tenantId: request.tenantId },
          ],
        },
        orderBy: { sortOrder: 'asc' },
      })

      return reply.send({
        data: stockTypes,
        meta: { total: stockTypes.length, page: 1, perPage: stockTypes.length },
      })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /stock-types — admin only: create tenant-custom type (is_system must not be true)
  app.post('/stock-types', { preHandler: requireRole('admin') }, async (request, reply) => {
    try {
      const parse = createStockTypeDefinitionSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      // Guard: reject any attempt to create a system type via the API
      const body = request.body as Record<string, unknown>
      if (body['isSystem'] === true) {
        return reply.code(400).send({
          error: { code: 'INVALID_INPUT', message: 'Cannot create system stock types via this endpoint' },
        })
      }

      const stockType = await request.db.stockTypeDefinition.create({
        data: {
          tenantId: request.tenantId,
          key: parse.data.key,
          label: parse.data.label,
          description: parse.data.description ?? null,
          color: parse.data.color ?? null,
          sortOrder: parse.data.sortOrder ?? 0,
          isSystem: false,
        },
      })

      return reply.code(201).send({ data: stockType })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({
          error: { code: 'CONFLICT', message: 'A stock type with this key already exists for your tenant' },
        })
      }
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /stock-types/:id — admin only: update label, color, sort_order; reject if is_system
  app.patch('/stock-types/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().uuid() })
      const paramsResult = paramsSchema.safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid stock type ID format' } })
      }
      const { id } = paramsResult.data

      const parse = updateStockTypeSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const existing = await request.db.stockTypeDefinition.findFirst({
        where: {
          id,
          OR: [{ tenantId: null }, { tenantId: request.tenantId }],
        },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stock type not found' } })
      }
      if (existing.isSystem) {
        return reply.code(403).send({
          error: { code: 'CANNOT_MODIFY_SYSTEM_TYPE', message: 'System stock types cannot be modified' },
        })
      }

      const updated = await request.db.stockTypeDefinition.update({
        where: { id },
        data: omitUndefined(parse.data) as unknown as Prisma.StockTypeDefinitionUpdateInput,
      })

      return reply.send({ data: updated })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /stock-types/:id — admin only: reject if is_system
  // NOTE: StockTypeDefinition has no deletedAt — hard delete required.
  app.delete('/stock-types/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().uuid() })
      const paramsResult = paramsSchema.safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid stock type ID format' } })
      }
      const { id } = paramsResult.data

      const existing = await request.db.stockTypeDefinition.findFirst({
        where: {
          id,
          OR: [{ tenantId: null }, { tenantId: request.tenantId }],
        },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Stock type not found' } })
      }
      if (existing.isSystem) {
        return reply.code(400).send({
          error: { code: 'CANNOT_DELETE_SYSTEM_TYPE', message: 'System stock types cannot be deleted' },
        })
      }

      await request.db.stockTypeDefinition.delete({ where: { id } })

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })
}
