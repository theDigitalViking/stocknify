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
  productId: uuidSchema.optional(),
  stockType: z.string().min(1).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(50),
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
      const { variantId, locationId, productId, stockType, search, page, perPage } = query.data

      const where: Prisma.StockLevelWhereInput = { tenantId: request.tenantId }
      if (variantId) where.variantId = variantId
      if (locationId) where.locationId = locationId
      if (productId) {
        // Scope to variants of the given product. Used by the product-detail
        // stock table so it shows only this product's inventory.
        where.variant = { productId, deletedAt: null }
      }
      if (stockType) where.stockType = stockType
      if (search) {
        where.OR = [
          { variant: { sku: { contains: search, mode: 'insensitive' } } },
          { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
        ]
      }

      // NOTE: In-memory grouping requires fetching all matching rows. For large datasets,
      // this should be replaced with a SQL GROUP BY query. For now, cap at 10k rows.
      const levels = await request.db.stockLevel.findMany({
        where,
        include: {
          variant: { include: { product: true } },
          location: true,
          storageLocation: true,
          batch: true,
        },
        orderBy: [{ variant: { sku: 'asc' } }, { location: { name: 'asc' } }],
        take: 10_000,
      })

      // Group by (variantId, locationId, storageLocationId, batchId) and
      // aggregate quantities by stockType. Each dimension in the key
      // corresponds to a user-meaningful split on the UI — the product
      // detail page shows every row, the main stock page flattens by
      // stockType but keeps the other three.
      type StockRow = {
        variantId: string
        productId: string
        sku: string
        productName: string
        locationId: string
        locationName: string
        locationType: string
        storageLocationId: string | null
        storageLocationName: string | null
        batchId: string | null
        batchNumber: string | null
        expiryDate: string | null
        quantities: Record<string, number>
        lastSyncedAt: Date | null
      }

      const grouped = new Map<string, StockRow>()
      for (const level of levels) {
        // `-` sentinel distinguishes "no bin"/"no batch" from any real id.
        const key = [
          level.variantId,
          level.locationId,
          level.storageLocationId ?? '-',
          level.batchId ?? '-',
        ].join(':')
        if (!grouped.has(key)) {
          grouped.set(key, {
            variantId: level.variantId,
            productId: level.variant.productId,
            sku: level.variant.sku,
            productName: level.variant.product.name,
            locationId: level.locationId,
            locationName: level.location.name,
            locationType: level.location.type,
            storageLocationId: level.storageLocationId,
            storageLocationName: level.storageLocation?.name ?? null,
            batchId: level.batchId,
            batchNumber: level.batch?.batchNumber ?? null,
            expiryDate: level.batch?.expiryDate?.toISOString() ?? null,
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

      const allData = Array.from(grouped.values())
      const skip = (page - 1) * perPage
      const data = allData.slice(skip, skip + perPage)
      return reply.send({ data, meta: { total: allData.length, page, perPage } })
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
      const paramsResult = z.object({ variantId: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid variant ID format' } })
      }
      const { variantId } = paramsResult.data

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

      // Fix 5: verify all referenced entities belong to this tenant before entering transaction
      const variant = await request.db.productVariant.findFirst({
        where: { id: variantId, tenantId: request.tenantId, deletedAt: null },
      })
      if (!variant) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Variant not found' } })
      }

      const location = await request.db.location.findFirst({
        where: { id: locationId, tenantId: request.tenantId, deletedAt: null },
      })
      if (!location) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Location not found' } })
      }

      if (storageLocationId) {
        const sl = await request.db.storageLocation.findFirst({
          where: { id: storageLocationId, locationId, tenantId: request.tenantId, deletedAt: null },
        })
        if (!sl) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storage location not found' } })
        }
      }

      if (batchId) {
        const batch = await request.db.batch.findFirst({
          where: { id: batchId, tenantId: request.tenantId },
        })
        if (!batch) {
          return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Batch not found' } })
        }
      }

      const level = await request.db.$transaction(async (tx) => {
        // Fix 6: use SELECT ... FOR UPDATE to lock the row and prevent race conditions
        // on concurrent corrections for the same (variant, location, stockType) tuple.
        type LockRow = { id: string; quantity: string }
        const lockRows = await tx.$queryRaw<LockRow[]>`
          SELECT id, quantity::text FROM stock_levels
          WHERE tenant_id = ${request.tenantId}::uuid
            AND variant_id = ${variantId}::uuid
            AND location_id = ${locationId}::uuid
            AND stock_type = ${stockType}
            AND storage_location_id IS NOT DISTINCT FROM ${storageLocationId ?? null}::uuid
            AND batch_id IS NOT DISTINCT FROM ${batchId ?? null}::uuid
          FOR UPDATE
        `
        const locked = lockRows[0] ?? null
        const quantityBefore = locked ? Number(locked.quantity) : 0

        // Step 2: upsert stock level
        const updated = locked
          ? await tx.stockLevel.update({
              where: { id: locked.id },
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
