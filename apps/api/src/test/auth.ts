import jwt from 'jsonwebtoken'

export interface TestJwtPayload {
  tenantId: string
  userId: string
  role?: 'admin' | 'manager' | 'viewer' | 'user'
  email?: string
}

function getJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error('[test] SUPABASE_JWT_SECRET is not set — cannot sign test JWT')
  }
  return secret
}

export function signTestJwt(payload: TestJwtPayload, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    sub: payload.userId,
    aud: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
    email: payload.email ?? 'test@stocknify.test',
    role: 'authenticated',
    app_metadata: {
      tenant_id: payload.tenantId,
      role: payload.role ?? 'admin',
    },
  }
  return jwt.sign(claims, getJwtSecret(), { algorithm: 'HS256' })
}

export function authedHeaders(payload: TestJwtPayload): { authorization: string } {
  return { authorization: `Bearer ${signTestJwt(payload)}` }
}
