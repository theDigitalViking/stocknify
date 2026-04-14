import type { FastifyInstance } from 'fastify'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// STUB: implement in Phase 2
export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  app.get('/integrations', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /integrations — implement in Phase 2' },
    })
  })

  app.post('/integrations', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /integrations — implement in Phase 2' },
    })
  })

  app.get('/integrations/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /integrations/:id — implement in Phase 2' },
    })
  })

  app.patch('/integrations/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'PATCH /integrations/:id — implement in Phase 2',
      },
    })
  })

  app.delete('/integrations/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'DELETE /integrations/:id — implement in Phase 2',
      },
    })
  })

  app.post('/integrations/:id/sync', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'POST /integrations/:id/sync — implement in Phase 2',
      },
    })
  })

  app.get('/integrations/:id/status', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'GET /integrations/:id/status — implement in Phase 2',
      },
    })
  })
}
