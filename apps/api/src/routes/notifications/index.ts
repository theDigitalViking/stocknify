import type { FastifyInstance } from 'fastify'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// STUB: implement in Phase 2
export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  app.get('/notification-channels', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'GET /notification-channels — implement in Phase 2',
      },
    })
  })

  app.post('/notification-channels', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'POST /notification-channels — implement in Phase 2',
      },
    })
  })

  app.patch('/notification-channels/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'PATCH /notification-channels/:id — implement in Phase 2',
      },
    })
  })

  app.delete('/notification-channels/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'DELETE /notification-channels/:id — implement in Phase 2',
      },
    })
  })

  app.post('/notification-channels/:id/test', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'POST /notification-channels/:id/test — implement in Phase 2',
      },
    })
  })

  app.get('/alerts', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /alerts — implement in Phase 2' },
    })
  })

  app.patch('/alerts/:id/acknowledge', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'PATCH /alerts/:id/acknowledge — implement in Phase 2',
      },
    })
  })
}
