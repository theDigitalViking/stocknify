import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import type { FastifyInstance } from 'fastify'

import { config } from '../config.js'
import { redis } from '../jobs/queue.js'

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP managed by Next.js / Vercel
  })

  // CORS — allow requests from the web frontend and localhost in dev
  await app.register(cors, {
    origin:
      config.NODE_ENV === 'production'
        ? ['https://app.stocknify.io', 'https://staging.stocknify.io']
        : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  // Rate limiting — 100 req/min per IP (auth routes get stricter limits in their handler)
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) => {
      // Prefer tenant-level limiting once authenticated; fall back to IP
      const tenantId = (request as { tenantId?: string }).tenantId
      return tenantId ?? (request.ip || 'unknown')
    },
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${String(context.after)}.`,
      },
    }),
  })

  // JWT verification (Supabase-compatible HS256)
  await app.register(jwt, {
    secret: config.SUPABASE_JWT_SECRET,
    decode: { complete: true },
    verify: { algorithms: ['HS256'] },
  })

  // Fastify sensible helpers (httpErrors, assert, etc.)
  await app.register(sensible)
}
