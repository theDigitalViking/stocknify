import type { FastifyInstance } from 'fastify'

// STUB: implement in Phase 2
// Incoming webhooks from external systems — always verify HMAC before processing
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/shopify/:integrationId', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'POST /webhooks/shopify/:integrationId — implement in Phase 2',
      },
    })
  })

  app.post('/webhooks/woocommerce/:integrationId', async (_request, reply) => {
    await reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'POST /webhooks/woocommerce/:integrationId — implement in Phase 2',
      },
    })
  })
}
