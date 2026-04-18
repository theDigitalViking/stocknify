import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import jwksClient from 'jwks-rsa'

import { config } from '../config.js'

// CSV import limits — enforced by multipart before parsing begins.
// Keep these in sync with the documented limits in PROMPT_CSV_PRODUCT_IMPORT_BACKEND.
const CSV_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const CSV_MAX_TEXT_FIELD_BYTES = 1024 * 1024 // 1 MB — plenty for JSON metadata fields

// Supabase migrated to asymmetric ES256 JWT signing. Legacy HS256 tokens are
// still around, so we verify both: ES256 via the project's JWKS endpoint,
// HS256 via the legacy shared secret.
const jwks = jwksClient({
  jwksUri: `${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
})

interface JwtHeader {
  alg: string
  kid?: string
}

interface JwtTokenPreview {
  header: JwtHeader
}

export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security headers
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP managed by Next.js / Vercel
  })

  // CORS — allow requests from the web frontend and localhost in dev
  await app.register(cors, {
    origin:
      config.NODE_ENV === 'production'
        ? ['https://app.stocknify.app', 'https://staging.stocknify.app']
        : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  // Rate limiting — 100 req/min per IP
  // NOTE: Using in-memory store for now; switch to Redis once connection is stable
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/v1/health',
    keyGenerator: (request) => {
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

  // JWT verification — supports both Supabase's legacy HS256 shared secret
  // and the newer ES256 asymmetric signing keys (via JWKS).
  await app.register(jwt, {
    secret: {
      public: async (_request: FastifyRequest, tokenOrString: unknown): Promise<string> => {
        const token = tokenOrString as JwtTokenPreview
        if (token.header.alg === 'ES256') {
          if (!token.header.kid) {
            throw new Error('ES256 token has no kid header')
          }
          const key = await jwks.getSigningKey(token.header.kid)
          return key.getPublicKey()
        }
        return config.SUPABASE_JWT_SECRET
      },
    },
    decode: { complete: true },
    verify: { algorithms: ['HS256', 'ES256'] },
  })

  // Fastify sensible helpers (httpErrors, assert, etc.)
  await app.register(sensible)

  // Multipart — CSV upload routes use this. Limits enforced before parsing.
  await app.register(multipart, {
    limits: {
      fileSize: CSV_MAX_FILE_SIZE_BYTES,
      files: 1,
      fields: 10,
      fieldSize: CSV_MAX_TEXT_FIELD_BYTES,
      headerPairs: 2000,
    },
  })
}
