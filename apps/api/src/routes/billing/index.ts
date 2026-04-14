import type { FastifyInstance } from 'fastify'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// STUB: implement in Phase 2
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // Stripe webhook does not require auth middleware — it uses HMAC signature verification
  app.post('/webhooks/stripe', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /webhooks/stripe — implement in Phase 2' },
    })
  })

  // Authenticated billing routes
  app.register(async (authenticated) => {
    authenticated.addHook('preHandler', authMiddleware)
    authenticated.addHook('preHandler', tenantMiddleware)

    authenticated.get('/billing/plans', async (_request, reply) => {
      await reply.code(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'GET /billing/plans — implement in Phase 2',
        },
      })
    })

    authenticated.get('/billing/subscription', async (_request, reply) => {
      await reply.code(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'GET /billing/subscription — implement in Phase 2',
        },
      })
    })

    authenticated.post('/billing/portal', async (_request, reply) => {
      await reply.code(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'POST /billing/portal — implement in Phase 2',
        },
      })
    })

    authenticated.post('/billing/checkout', async (_request, reply) => {
      await reply.code(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'POST /billing/checkout — implement in Phase 2',
        },
      })
    })
  })
}
