import type { FastifyReply, FastifyRequest } from 'fastify'

// Shape of the Supabase JWT payload (relevant fields only)
interface SupabaseJwtPayload {
  sub: string
  email?: string
  role?: string
  // Custom claim injected by Supabase Edge Function / JWT hook
  user_metadata?: {
    tenant_id?: string
    role?: string
  }
  app_metadata?: {
    tenant_id?: string
    role?: string
  }
  aud: string
  exp: number
  iat: number
}

// Augment FastifyRequest to carry verified auth context
declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    tenantId: string
    userRole: string
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Verify JWT signature using @fastify/jwt (configured with SUPABASE_JWT_SECRET)
    await request.jwtVerify()

    const payload = request.user as SupabaseJwtPayload

    const userId = payload.sub
    if (!userId) {
      await reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid token: missing sub claim' },
      })
      return
    }

    // tenant_id is stored in app_metadata by our Supabase webhook handler
    const tenantId =
      payload.app_metadata?.tenant_id ?? payload.user_metadata?.tenant_id

    if (!tenantId) {
      await reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid token: missing tenant_id claim' },
      })
      return
    }

    // role is stored in app_metadata by our Supabase webhook handler; fallback to 'viewer'
    const userRole = payload.app_metadata?.role ?? payload.user_metadata?.role ?? 'viewer'

    request.userId = userId
    request.tenantId = tenantId
    request.userRole = userRole
  } catch {
    await reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    })
  }
}
