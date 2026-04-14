import type { FastifyInstance } from 'fastify'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// STUB: implement in Phase 2
export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  app.get('/rules', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /rules — implement in Phase 2' },
    })
  })

  app.post('/rules', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /rules — implement in Phase 2' },
    })
  })

  app.get('/rules/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /rules/:id — implement in Phase 2' },
    })
  })

  app.patch('/rules/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'PATCH /rules/:id — implement in Phase 2' },
    })
  })

  app.delete('/rules/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'DELETE /rules/:id — implement in Phase 2' },
    })
  })

  app.post('/rules/:id/test', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /rules/:id/test — implement in Phase 2' },
    })
  })
}
