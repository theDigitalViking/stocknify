import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// Strip undefined values so Prisma update() is happy under exactOptionalPropertyTypes
function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

import {
  createLocationSchema,
  createStorageLocationSchema,
  paginationSchema,
  updateLocationSchema,
  updateStorageLocationSchema,
} from '@stocknify/shared'

import { authMiddleware } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

export async function locationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // GET /storage-locations — flat list across all parent locations for a tenant.
  // Used by the stock-page filter dropdown; the per-location variant
  // (`/locations/:id/storage-locations`) already exists in the same file.
  app.get('/storage-locations', async (request, reply) => {
    try {
      const items = await request.db.storageLocation.findMany({
        where: { tenantId: request.tenantId, deletedAt: null },
        select: { id: true, locationId: true, name: true, type: true },
        orderBy: [{ locationId: 'asc' }, { name: 'asc' }],
      })
      return reply.send({ data: items })
    } catch (err) {
      request.log.error({ err }, 'storage-locations list failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list storage locations' } })
    }
  })

  // GET /locations — list non-deleted locations with storage location count
  app.get('/locations', async (request, reply) => {
    try {
      const query = paginationSchema.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: query.error.message } })
      }
      const { page, perPage } = query.data
      const skip = (page - 1) * perPage

      const where = { tenantId: request.tenantId, deletedAt: null }

      const [locations, total] = await Promise.all([
        request.db.location.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { storageLocations: { where: { deletedAt: null } } },
            },
          },
        }),
        request.db.location.count({ where }),
      ])

      return reply.send({ data: locations, meta: { total, page, perPage } })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /locations — create location
  app.post('/locations', async (request, reply) => {
    try {
      const parse = createLocationSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const location = await request.db.location.create({
        data: {
          tenantId: request.tenantId,
          name: parse.data.name,
          type: parse.data.type,
          integrationId: parse.data.integrationId ?? null,
          binTrackingEnabled: parse.data.binTrackingEnabled ?? false,
          address: (parse.data.address ?? {}) as Prisma.InputJsonObject,
        },
      })

      return reply.code(201).send({ data: location })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /locations/:id — update location
  app.patch('/locations/:id', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid location ID format' } })
      }
      const { id } = paramsResult.data

      const parse = updateLocationSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const existing = await request.db.location.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Location not found' } })
      }

      const location = await request.db.location.update({
        where: { id },
        data: omitUndefined(parse.data) as unknown as Prisma.LocationUpdateInput,
      })

      return reply.send({ data: location })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /locations/:id — admin only: soft-delete
  app.delete('/locations/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid location ID format' } })
      }
      const { id } = paramsResult.data

      const existing = await request.db.location.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Location not found' } })
      }

      await request.db.location.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /locations/:id/storage-locations — create storage location (bin/shelf) within a location
  app.post('/locations/:id/storage-locations', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid location ID format' } })
      }
      const { id } = paramsResult.data

      const parse = createStorageLocationSchema.omit({ locationId: true }).safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const location = await request.db.location.findFirst({
        where: { id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!location) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Location not found' } })
      }

      const storageLocation = await request.db.storageLocation.create({
        data: {
          tenantId: request.tenantId,
          locationId: id,
          name: parse.data.name,
          type: parse.data.type ?? 'bin',
          trackInventory: parse.data.trackInventory ?? true,
          metadata: (parse.data.metadata ?? {}) as Prisma.InputJsonObject,
        },
      })

      return reply.code(201).send({ data: storageLocation })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /locations/:id/storage-locations/:sid — update storage location
  app.patch('/locations/:id/storage-locations/:sid', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid(), sid: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' } })
      }
      const { id, sid } = paramsResult.data

      const parse = updateStorageLocationSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const existing = await request.db.storageLocation.findFirst({
        where: { id: sid, locationId: id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storage location not found' } })
      }

      const updated = await request.db.storageLocation.update({
        where: { id: sid },
        data: omitUndefined(parse.data) as unknown as Prisma.StorageLocationUpdateInput,
      })

      return reply.send({ data: updated })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /locations/:id/storage-locations/:sid — soft-delete storage location
  app.delete('/locations/:id/storage-locations/:sid', async (request, reply) => {
    try {
      const paramsResult = z.object({ id: z.string().uuid(), sid: z.string().uuid() }).safeParse(request.params)
      if (!paramsResult.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid ID format' } })
      }
      const { id, sid } = paramsResult.data

      const existing = await request.db.storageLocation.findFirst({
        where: { id: sid, locationId: id, tenantId: request.tenantId, deletedAt: null },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Storage location not found' } })
      }

      await request.db.storageLocation.update({
        where: { id: sid },
        data: { deletedAt: new Date() },
      })

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })
}
