import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import {
  movementTypeSchema,
  paginationSchema,
  upsertStockLevelSchema,
  uuidSchema,
} from '@stocknify/shared'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// Extend the shared upsert schema with an optional reason for the movement record
const upsertBodySchema = upsertStockLevelSchema.extend({
  reason: z.string().optional(),
})

const stockQuerySchema = z.object({
  variantId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  stockType: z.string().min(1).optional(),
  search: z.string().optional(),
})

const movementsQuerySchema = paginationSchema.extend({
  variantId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  movementType: movementTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // GET /stock — aggregated stock overview grouped by (variant, location)
  app.get('/stock', async (request, reply) => {
    try {
      const query = stockQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: query.error.message } })
      }
      const { variantId, locationId, stockType, search } = query.data

      const where: Prisma.StockLevelWhereInput = { tenantId: request.tenantId }
      if (variantId) where.variantId = variantId
      if (locationId) where.locationId = locationId
      if (stockType) where.stockType = stockType
      if (search) {
        where.OR = [
          { variant: { sku: { contains: search, mode: 'insensitive' } } },
          { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
        ]
      }

      const levels = await request.db.stockLevel.findMany({
        where,
        include: {
          variant: { include: { product: true } },
          location: true,
        },
        orderBy: [{ variant: { sku: 'asc' } }, { location: { name: 'asc' } }],
      })

      // Group by (variantId, locationId) and aggregate quantities by stockType
      type StockRow = {
        variantId: string
        sku: string
        productName: string
        locationId: string
        locationName: string
        locationType: string
        quantities: Record<string, number>
        lastSyncedAt: Date | null
      }

      const grouped = new Map<string, StockRow>()
      for (const level of levels) {
        const key = `${level.variantId}:${level.locationId}`
        if (!grouped.has(key)) {
          grouped.set(key, {
            variantId: level.variantId,
            sku: level.variant.sku,
            productName: level.variant.product.name,
            locationId: level.locationId,
            locationName: level.location.name,
            locationType: level.location.type,
            quantities: {},
            lastSyncedAt: level.lastSyncedAt,
          })
        }
        const row = grouped.get(key) as StockRow
        row.quantities[level.stockType] = Number(level.quantity)
        if (level.lastSyncedAt && (!row.lastSyncedAt || level.lastSyncedAt > row.lastSyncedAt)) {
          row.lastSyncedAt = level.lastSyncedAt
        }
      }

      const data = Array.from(grouped.values())
      return reply.send({ data, meta: { total: data.length, page: 1, perPage: data.length } })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // GET /stock/movements — paginated movement history (must be before /stock/:variantId)
  app.get('/stock/movements', async (request, reply) => {
    try {
      const query = movementsQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: query.error.message } })
      }
      const { page, perPage, variantId, locationId, movementType, from, to } = query.data
      const skip = (page - 1) * perPage

      const where: Prisma.StockMovementWhereInput = { tenantId: request.tenantId }
      if (variantId) where.variantId = variantId
      if (locationId) where.locationId = locationId
      if (movementType) where.movementType = movementType
      if (from ?? to) {
        where.createdAt = {}
        if (from) where.createdAt.gte = new Date(from)
        if (to) where.createdAt.lte = new Date(to)
      }

      const [movements, total] = await Promise.all([
        request.db.stockMovement.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { createdAt: 'desc' },
        }),
        request.db.stockMovement.count({ where }),
      ])

      return reply.send({ data: movements, meta: { total, page, perPage } })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // GET /stock/:variantId — all stock levels for one variant
  app.get('/stock/:variantId', async (request, reply) => {
    try {
      const { variantId } = request.params as { variantId: string }

      const variant = await request.db.productVariant.findFirst({
        where: { id: variantId, tenantId: request.tenantId, deletedAt: null },
      })
      if (!variant) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Variant not found' } })
      }

      const levels = await request.db.stockLevel.findMany({
        where: { tenantId: request.tenantId, variantId },
        include: { location: true, storageLocation: true, batch: true },
        orderBy: [{ location: { name: 'asc' } }, { stockType: 'asc' }],
      })

      return reply.send({ data: levels })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PUT /stock — upsert stock level + create correction movement in one transaction
  app.put('/stock', async (request, reply) => {
    try {
      const parse = upsertBodySchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }
      const { variantId, locationId, storageLocationId, batchId, stockType, quantity, reason } =
        parse.data

      const level = await request.db.$transaction(async (tx) => {
        // Step 1: load current stock level (or treat as 0 if missing)
        const existing = await tx.stockLevel.findFirst({
          where: {
            tenantId: request.tenantId,
            variantId,
            locationId,
            storageLocationId: storageLocationId ?? null,
            batchId: batchId ?? null,
            stockType,
          },
        })

        const quantityBefore = existing ? Number(existing.quantity) : 0

        // Step 2: upsert stock level
        const updated = existing
          ? await tx.stockLevel.update({
              where: { id: existing.id },
              data: { quantity, source: 'manual' },
            })
          : await tx.stockLevel.create({
              data: {
                tenantId: request.tenantId,
                variantId,
                locationId,
                storageLocationId: storageLocationId ?? null,
                batchId: batchId ?? null,
                stockType,
                quantity,
                source: 'manual',
              },
            })

        // Step 3: append movement record
        await tx.stockMovement.create({
          data: {
            tenantId: request.tenantId,
            variantId,
            locationId,
            storageLocationId: storageLocationId ?? null,
            batchId: batchId ?? null,
            stockType,
            quantityBefore,
            quantityAfter: quantity,
            delta: quantity - quantityBefore,
            movementType: 'correction',
            reason: reason ?? null,
            source: 'manual',
            createdBy: request.userId,
          },
        })

        return updated
      })

      return reply.send({ data: level })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })
}
