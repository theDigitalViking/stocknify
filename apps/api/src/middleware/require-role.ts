import type { FastifyReply, FastifyRequest } from 'fastify'

type Role = 'admin' | 'user' | 'viewer'

/**
 * Fastify preHandler factory — rejects requests whose userRole is not in the
 * allowed list with 403 FORBIDDEN. Must run AFTER authMiddleware.
 */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.userRole as Role)) {
      await reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
      })
    }
  }
}
