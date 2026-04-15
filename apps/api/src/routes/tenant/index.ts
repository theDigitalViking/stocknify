import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import {
  inviteUserSchema,
  paginationSchema,
  updateTenantSchema,
  userRoleSchema,
} from '@stocknify/shared'

// Strip undefined values so Prisma update() is happy under exactOptionalPropertyTypes
function omitUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

import { inviteUserByEmail } from '../../lib/supabase-admin.js'
import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // GET /tenant — return current tenant
  app.get('/tenant', async (request, reply) => {
    try {
      const tenant = await request.db.tenant.findUnique({
        where: { id: request.tenantId },
      })
      if (!tenant || tenant.deletedAt) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Tenant not found' } })
      }
      return reply.send({ data: tenant })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // PATCH /tenant — update name and/or slug
  app.patch('/tenant', async (request, reply) => {
    try {
      const parse = updateTenantSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const tenant = await request.db.tenant.update({
        where: { id: request.tenantId },
        data: omitUndefined(parse.data) as unknown as Prisma.TenantUpdateInput,
      })
      return reply.send({ data: tenant })
    } catch (err) {
      if (err instanceof Error && err.message.includes('Unique constraint')) {
        return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Slug already in use' } })
      }
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // GET /users — list all users for current tenant
  app.get('/users', async (request, reply) => {
    try {
      const query = paginationSchema.safeParse(request.query)
      if (!query.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: query.error.message } })
      }
      const { page, perPage } = query.data
      const skip = (page - 1) * perPage

      const [users, total] = await Promise.all([
        request.db.user.findMany({
          where: { tenantId: request.tenantId },
          skip,
          take: perPage,
          orderBy: { createdAt: 'asc' },
        }),
        request.db.user.count({ where: { tenantId: request.tenantId } }),
      ])

      return reply.send({ data: users, meta: { total, page, perPage } })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // POST /users/invite — invite user via Supabase Auth, then upsert users row
  app.post('/users/invite', async (request, reply) => {
    try {
      const parse = inviteUserSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }
      const { email, role } = parse.data

      const invited = await inviteUserByEmail(email)

      const user = await request.db.user.upsert({
        where: { id: invited.id },
        create: {
          id: invited.id,
          tenantId: request.tenantId,
          email,
          role,
        },
        update: {
          role,
          tenantId: request.tenantId,
        },
      })

      return reply.code(201).send({ data: user })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message } })
    }
  })

  // PATCH /users/:id — update role only
  app.patch('/users/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      const parse = z.object({ role: userRoleSchema }).safeParse(request.body)
      if (!parse.success) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: parse.error.message } })
      }

      const existing = await request.db.user.findFirst({
        where: { id, tenantId: request.tenantId },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } })
      }

      const user = await request.db.user.update({
        where: { id },
        data: { role: parse.data.role },
      })

      return reply.send({ data: user })
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })

  // DELETE /users/:id — soft-delete (User has no deletedAt; hard-delete required)
  // NOTE: User model has no deletedAt column — this performs a hard delete.
  // A future schema migration should add deletedAt to the users table.
  app.delete('/users/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }

      if (id === request.userId) {
        return reply.code(400).send({
          error: { code: 'USER_CANNOT_DELETE_SELF', message: 'You cannot delete your own account' },
        })
      }

      const existing = await request.db.user.findFirst({
        where: { id, tenantId: request.tenantId },
      })
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } })
      }

      await request.db.user.delete({ where: { id } })

      return reply.code(204).send()
    } catch {
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })
}
