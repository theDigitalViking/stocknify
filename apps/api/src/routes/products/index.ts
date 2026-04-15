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
  updateProductSchema,
  updateProductVariantSchema,
} from '@stocknify/shared'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// POST /products requires a SKU for the auto-created default variant
const createProductBodySchema = z.object({
  name: z.string().min(1).max(500),
  sku: z.string().min(1).max(255), // for the default variant
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const listQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
})

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // GET /products — list with active variant count, optional ?search=
  app.get('/products', async (request, reply) => {
    try {
      const query = listQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: query.error.message } })
      }
      const { page, perPage, search } = query.data
      const skip = (page - 1) * perPage

      const where: Prisma.ProductWhereInput = {
        tenantId: request.tenantId,
        deletedAt: null,
      }
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          {
            variants: {
              some: { sku: { contains: search, mode: 'insensitive' }, deletedAt: null },
            },
          },
        ]
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
      const { sku, name, description, category, unit, batchTracking, metadata } = parse.data

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
      const { id } = request.params as { id: string }

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

      return reply.send({ data: product })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /products/:id — update master data
  app.patch('/products/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      const parse = updateProductSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const existing = await request.db.product.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found' } })
      }

      const product = await request.db.product.update({
        where: { id },
        data: omitUndefined(parse.data) as unknown as Prisma.ProductUpdateInput,
      })

      return reply.send({ data: product })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /products/:id — soft-delete product and all its variants in one transaction
  app.delete('/products/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      const existing = await request.db.product.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found' } })
      }

      const now = new Date()
      await request.db.$transaction([
        request.db.product.update({
          where: { id },
          data: { deletedAt: now },
        }),
        request.db.productVariant.updateMany({
          where: { productId: id, tenantId: request.tenantId, deletedAt: null },
          data: { deletedAt: now },
        }),
      ])

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /products/:id/variants — add a variant to an existing product
  app.post('/products/:id/variants', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

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
      const { id, vid } = request.params as { id: string; vid: string }

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
      const { id, vid } = request.params as { id: string; vid: string }

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
