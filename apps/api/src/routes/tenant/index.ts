import type { FastifyInstance } from 'fastify'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// STUB: implement in Phase 2
export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  app.get('/tenant', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /tenant — implement in Phase 2' },
    })
  })

  app.patch('/tenant', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'PATCH /tenant — implement in Phase 2' },
    })
  })

  app.get('/users', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /users — implement in Phase 2' },
    })
  })

  app.post('/users/invite', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /users/invite — implement in Phase 2' },
    })
  })

  app.patch('/users/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'PATCH /users/:id — implement in Phase 2' },
    })
  })

  app.delete('/users/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'DELETE /users/:id — implement in Phase 2' },
    })
  })
}
