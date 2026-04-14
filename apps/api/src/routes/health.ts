import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    await reply.code(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  })
}
