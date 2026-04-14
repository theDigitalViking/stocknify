import type { FastifyInstance } from 'fastify'

import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// STUB: implement in Phase 2
export async function productsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  app.get('/products', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /products — implement in Phase 2' },
    })
  })

  app.post('/products', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /products — implement in Phase 2' },
    })
  })

  app.get('/products/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'GET /products/:id — implement in Phase 2' },
    })
  })

  app.patch('/products/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'PATCH /products/:id — implement in Phase 2' },
    })
  })

  app.delete('/products/:id', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'DELETE /products/:id — implement in Phase 2' },
    })
  })
}
