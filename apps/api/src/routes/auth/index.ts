import type { FastifyInstance } from 'fastify'

// STUB: implement in Phase 2
// Handles the Supabase auth webhook that fires when a user signs up.
// Creates a tenant + user row in our database.
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/webhook', async (_request, reply) => {
    await reply.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'POST /auth/webhook — implement in Phase 2' },
    })
  })
}
