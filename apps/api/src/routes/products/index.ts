import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// Strip undefined values so Prisma update() is happy under exactOptionalPropertyTypes
function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

import {
  createProductVariantSchema,
  paginationSchema,
  updateProductVariantSchema,
} from '@stocknify/shared'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// POST /products requires a SKU for the auto-created default variant
const createProductBodySchema = z.object({
  name: z.string().min(1).max(500),
  sku: z.string().min(1).max(255),         // for the default variant
  barcode: z.string().max(255).optional(),  // EAN/barcode for the default variant
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const listQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  showDeleted: z.enum(['true', 'false']).optional(),
})

// PATCH /products body. sku + barcode update the default variant, not the
// product row itself — see the identity guards in the handler.
const updateProductBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().optional(),
  batchTracking: z.boolean().optional(),
  sku: z.string().min(1).max(255).optional(),
  barcode: z.string().max(255).optional(),
})

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // GET /products — list with active variant count, optional ?search=, ?showDeleted=
  app.get('/products', async (request, reply) => {
    try {
      const query = listQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: query.error.message } })
      }
      const { page, perPage, search, showDeleted: showDeletedRaw } = query.data
      const skip = (page - 1) * perPage
      const showDeleted = showDeletedRaw === 'true'

      const where: Prisma.ProductWhereInput = {
        tenantId: request.tenantId,
        deletedAt: showDeleted ? { not: null } : null,
      }
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          {
            variants: {
              // In deleted-view mode the product's variants are themselves
              // soft-deleted (DELETE handler cascades deletedAt to all
              // variants). Filtering by deletedAt: null would then hide every
              // deleted product from SKU search. Drop the filter in that mode
              // so SKU lookup still works on deleted rows.
              some: {
                sku: { contains: search, mode: 'insensitive' },
                ...(showDeleted ? {} : { deletedAt: null }),
              },
            },
          },
        ]
      }

      // Deleted products: show all variants (including soft-deleted) so the row
      // still has an SKU to display. Active products: only non-deleted variants.
      const variantsInclude = showDeleted
        ? {
            orderBy: { createdAt: 'asc' as const },
            take: 1,
            select: { id: true, sku: true, barcode: true },
          }
        : {
            where: { isActive: true, deletedAt: null },
            orderBy: { createdAt: 'asc' as const },
            take: 1,
            select: { id: true, sku: true, barcode: true },
          }

      const [products, total] = await Promise.all([
        request.db.product.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { variants: { where: { isActive: true, deletedAt: null } } },
            },
            variants: variantsInclude,
            ...(showDeleted
              ? {
                  deletedByUser: {
                    select: { id: true, email: true, fullName: true },
                  },
                }
              : {}),
          },
        }),
        request.db.product.count({ where }),
      ])

      return reply.send({ data: products, meta: { total, page, perPage } })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /products — create product + auto-create default variant in one transaction
  app.post('/products', async (request, reply) => {
    try {
      const parse = createProductBodySchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }
      const { sku, barcode, name, description, category, unit, batchTracking, metadata } = parse.data

      const product = await request.db.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            tenantId: request.tenantId,
            name,
            description: description ?? null,
            category: category ?? null,
            unit,
            batchTracking: batchTracking ?? false,
            metadata: (metadata ?? {}) as Prisma.InputJsonObject,
          },
        })
        await tx.productVariant.create({
          data: {
            tenantId: request.tenantId,
            productId: created.id,
            sku,
            barcode: barcode ?? null,
            name: null,
            attributes: {} as Prisma.InputJsonObject,
            isActive: true,
          },
        })
        return created
      })

      return reply.code(201).send({ data: product })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: { code: 'CONFLICT', message: 'A variant with this SKU already exists' } })
      }
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // GET /products/:id — detail with non-deleted variants
  app.get('/products/:id', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product ID format' } })
      }
      const { id } = paramsResult.data

      const product = await request.db.product.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
        include: {
          variants: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!product) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found' } })
      }

      // Flag whether this product is linked to an external integration (any
      // variant with a row in external_references). The frontend uses this to
      // lock SKU and barcode fields on the edit dialog.
      const externalRefCount = await request.db.externalReference.count({
        where: {
          tenantId: request.tenantId,
          resourceType: 'product_variant',
          resourceId: { in: product.variants.map((v) => v.id) },
        },
      })

      return reply.send({
        data: {
          ...product,
          hasExternalReferences: externalRefCount > 0,
        },
      })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /products/:id — update master data
  app.patch('/products/:id', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product ID format' } })
      }
      const { id } = paramsResult.data

      const parse = updateProductBodySchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const existing = await request.db.product.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found' } })
      }

      // Identity guard: SKU + barcode (both on the default variant) are the
      // primary record key for integrations. Two independent conditions lock
      // them and either alone is sufficient to reject the change:
      //   1. The product did not originate manually — `metadata.source` is
      //      set to a non-'manual' value (CSV import, API, integration sync).
      //      In that case the source system is authoritative for identity.
      //   2. At least one variant has a row in `external_references` — a live
      //      integration is using that SKU/barcode as the linking key.
      // The check runs whenever sku or barcode is in the patch body.
      if (parse.data.sku !== undefined || parse.data.barcode !== undefined) {
        const meta = (existing.metadata ?? {}) as Record<string, unknown>
        const source = typeof meta['source'] === 'string' ? (meta['source'] as string) : undefined
        if (source && source !== 'manual') {
          return reply.code(409).send({
            error: {
              code: 'PRODUCT_IDENTITY_LOCKED',
              message:
                'SKU and barcode cannot be changed on products that were imported from an external source.',
            },
          })
        }

        const variantIds = (
          await request.db.productVariant.findMany({
            where: { productId: id, tenantId: request.tenantId, deletedAt: null },
            select: { id: true },
          })
        ).map((v) => v.id)

        if (variantIds.length > 0) {
          const externalRefCount = await request.db.externalReference.count({
            where: {
              tenantId: request.tenantId,
              resourceType: 'product_variant',
              resourceId: { in: variantIds },
            },
          })

          if (externalRefCount > 0) {
            return reply.code(409).send({
              error: {
                code: 'PRODUCT_IDENTITY_LOCKED',
                message:
                  'SKU and barcode cannot be changed while this product is connected to an integration.',
              },
            })
          }
        }
      }

      // Guard: batchTracking can only be deactivated when no batch-linked
      // stock levels exist. Otherwise we would orphan rows whose batchId no
      // longer carries semantic meaning.
      if (parse.data.batchTracking === false && existing.batchTracking === true) {
        const variantIds = (
          await request.db.productVariant.findMany({
            where: { productId: id, tenantId: request.tenantId, deletedAt: null },
            select: { id: true },
          })
        ).map((v) => v.id)

        if (variantIds.length > 0) {
          const batchStockCount = await request.db.stockLevel.count({
            where: {
              tenantId: request.tenantId,
              variantId: { in: variantIds },
              batchId: { not: null },
            },
          })

          if (batchStockCount > 0) {
            return reply.code(409).send({
              error: {
                code: 'BATCH_STOCK_EXISTS',
                message:
                  'Cannot deactivate batch tracking while batch stock levels exist for this product.',
              },
            })
          }
        }
      }

      // sku + barcode live on the default variant, not the product — route
      // them separately. Both the product row update and the variant update
      // run inside a single interactive transaction so a unique-SKU conflict
      // (P2002) on the variant write rolls back the product-field changes
      // instead of leaving a partial edit behind.
      const { sku, barcode, ...productFields } = parse.data

      try {
        const result = await request.db.$transaction(async (tx) => {
          const product = await tx.product.update({
            where: { id },
            data: omitUndefined(productFields) as unknown as Prisma.ProductUpdateInput,
          })

          if (sku !== undefined || barcode !== undefined) {
            const defaultVariant = await tx.productVariant.findFirst({
              where: { productId: id, tenantId: request.tenantId, deletedAt: null },
              orderBy: { createdAt: 'asc' },
            })
            if (defaultVariant) {
              await tx.productVariant.update({
                where: { id: defaultVariant.id },
                data: {
                  ...(sku !== undefined ? { sku } : {}),
                  ...(barcode !== undefined ? { barcode } : {}),
                },
              })
            }
          }

          return product
        })

        return reply.send({ data: result })
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // P2002 can come from either statement in the transaction (product
          // row or variant row). Narrow by constraint target so the client
          // gets an accurate message instead of a blanket "SKU exists" when
          // some other unique index was the one that actually fired.
          // meta.target is string (constraint name) or string[] (columns)
          // depending on the Prisma/driver combination.
          const target = Array.isArray(err.meta?.target)
            ? (err.meta?.target as string[]).join(',')
            : String(err.meta?.target ?? '')

          const isSkuConflict =
            target.includes('sku') ||
            target.includes('product_variants_tenant_id_sku_key')

          if (isSkuConflict) {
            return reply.code(409).send({
              error: { code: 'CONFLICT', message: 'A variant with this SKU already exists' },
            })
          }

          return reply.code(409).send({
            error: { code: 'CONFLICT', message: 'A unique constraint was violated' },
          })
        }
        return reply
          .code(500)
          .send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
      }
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /products/:id — soft-delete product and all its variants in one transaction
  app.delete('/products/:id', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product ID format' } })
      }
      const { id } = paramsResult.data

      const existing = await request.db.product.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found' } })
      }

      const now = new Date()
      const deletedBy = request.userId

      // Interactive transaction. Stock levels are deleted relationally via
      // raw SQL so the predicate evaluates current rows at execution time
      // rather than a pre-captured variantIds snapshot. Under READ COMMITTED
      // (Postgres default) a prior `findMany`-then-`deleteMany` pattern let a
      // concurrent variant insert bypass the stock cleanup while still being
      // soft-deleted by updateMany — that race is closed here. StockLevel has
      // no deletedAt; rows are removed outright so downstream syncs do not
      // republish them.
      await request.db.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: { deletedAt: now, deletedBy },
        })

        await tx.productVariant.updateMany({
          where: { productId: id, tenantId: request.tenantId, deletedAt: null },
          data: { deletedAt: now },
        })

        await tx.$executeRaw`
          DELETE FROM stock_levels
          WHERE tenant_id = ${request.tenantId}::uuid
            AND variant_id IN (
              SELECT id FROM product_variants
              WHERE product_id = ${id}::uuid
                AND tenant_id = ${request.tenantId}::uuid
            )
        `
      })

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /products/:id/variants — add a variant to an existing product
  app.post('/products/:id/variants', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid product ID format' } })
      }
      const { id } = paramsResult.data

      const parse = createProductVariantSchema.omit({ productId: true }).safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const product = await request.db.product.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!product) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found' } })
      }

      const variant = await request.db.productVariant.create({
        data: {
          tenantId: request.tenantId,
          productId: id,
          sku: parse.data.sku,
          name: parse.data.name ?? null,
          barcode: parse.data.barcode ?? null,
          attributes: (parse.data.attributes ?? {}) as Prisma.InputJsonObject,
          isActive: true,
        },
      })

      return reply.code(201).send({ data: variant })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: { code: 'CONFLICT', message: 'A variant with this SKU already exists' } })
      }
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /products/:id/variants/:vid — update variant fields
  app.patch('/products/:id/variants/:vid', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid(), vid: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' } })
      }
      const { id, vid } = paramsResult.data

      const parse = updateProductVariantSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const variant = await request.db.productVariant.findFirst({
        where: { id: vid, productId: id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!variant) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Variant not found' } })
      }

      const updated = await request.db.productVariant.update({
        where: { id: vid },
        data: omitUndefined(parse.data) as unknown as Prisma.ProductVariantUpdateInput,
      })

      return reply.send({ data: updated })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: { code: 'CONFLICT', message: 'A variant with this SKU already exists' } })
      }
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /products/:id/variants/:vid — soft-delete; reject if last active variant
  app.delete('/products/:id/variants/:vid', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid(), vid: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' } })
      }
      const { id, vid } = paramsResult.data

      const variant = await request.db.productVariant.findFirst({
        where: { id: vid, productId: id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!variant) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Variant not found' } })
      }

      const activeCount = await request.db.productVariant.count({
        where: { productId: id, tenantId: request.tenantId, isActive: true, deletedAt: null },
      })
      if (activeCount <= 1) {
        return reply.code(400).send({
          error: {
            code: 'LAST_ACTIVE_VARIANT',
            message: 'Cannot delete the last active variant of a product',
          },
        })
      }

      await request.db.productVariant.update({
        where: { id: vid },
        data: { deletedAt: new Date() },
      })

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })
}
