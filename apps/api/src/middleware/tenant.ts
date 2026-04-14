import { PrismaClient } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'

// A single Prisma instance is created here and reused across requests.
// The tenant context (Postgres session variable) is set per-request via
// $executeRaw so that RLS policies automatically filter all queries.
export const prisma = new PrismaClient({
  log: process.env['NODE_ENV'] === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})

// Augment the request with a pre-scoped Prisma client reference
declare module 'fastify' {
  interface FastifyRequest {
    db: PrismaClient
  }
}

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.tenantId) {
    await reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Tenant context missing — call authMiddleware first' },
    })
    return
  }

  try {
    // Set the Postgres session variable so that RLS policies can read it.
    // `true` as the third argument makes this setting local to the transaction.
    await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${request.tenantId}, true)`
    request.db = prisma
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error'
    await reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message },
    })
  }
}
