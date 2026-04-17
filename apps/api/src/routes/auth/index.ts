import crypto from 'node:crypto'

import { type PrismaClient } from '@prisma/client'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { config } from '../../config.js'
import { prisma } from '../../middleware/tenant.js'

// Service-role Supabase client for setting app_metadata on auth.users.
// tenant_id + role in app_metadata end up in the signed JWT claims, which
// authMiddleware reads on every authenticated request.
function getSupabaseAdmin(): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    rawBody: string | null
  }
}

interface SupabaseWebhookPayload {
  type: 'user.created' | 'user.updated' | 'user.deleted' | string
  record: {
    id: string
    email: string
    user_metadata?: {
      tenant_id?: string
      role?: string
    }
  }
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify the HMAC-SHA256 webhook signature sent by Supabase.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    // Supabase may send "sha256=<hex>" or just "<hex>"
    const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature
    if (expected.length !== computed.length) return false
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/** Convert an arbitrary string to a URL-safe slug (lowercase, hyphens, max 50 chars). */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return slug || 'tenant'
}

/** 4-character alphanumeric suffix for slug collision resolution. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6)
}

/**
 * Return a slug derived from `base` that doesn't yet exist in the tenants table.
 * Appends a random 4-char suffix on each retry (max 5 attempts).
 */
async function generateUniqueSlug(base: string, db: PrismaClient): Promise<string> {
  const baseSlug = slugify(base)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`
    const exists = await db.tenant.findUnique({ where: { slug } })
    if (!exists) return slug
  }
  throw new Error('SLUG_GENERATION_FAILED')
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Capture raw body string for HMAC signature verification — scoped to this plugin only.
  // Fastify requires decorateRequest before any route definitions.
  app.decorateRequest('rawBody', null)

  // Override the JSON content type parser within this plugin scope to also preserve
  // the raw body string, which is needed to recompute the HMAC.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as FastifyRequest & { rawBody: string | null }).rawBody = body as string
    try {
      done(null, JSON.parse(body as string) as unknown)
    } catch {
      done(new Error('Invalid JSON body'))
    }
  })

  /**
   * POST /auth/webhook
   *
   * Called by Supabase on auth.users INSERT events. Does NOT use auth + tenant
   * middleware — authentication is via HMAC-SHA256 signature verification.
   *
   * Scenario 1 (no tenant_id in user_metadata): self-signup → create tenant + admin user.
   * Scenario 2 (tenant_id present): invited user → create user row in existing tenant.
   * Scenario 3 (non-create event): silently ignored.
   */
  app.post('/auth/webhook', async (request, reply) => {
    // --- Signature verification ---
    const signature = request.headers['x-supabase-signature']
    if (typeof signature !== 'string' || !signature) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing webhook signature' } })
    }

    const rawBody = request.rawBody ?? ''
    if (!verifyWebhookSignature(rawBody, signature, config.SUPABASE_WEBHOOK_SECRET)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } })
    }

    // --- Event routing ---
    const payload = request.body as SupabaseWebhookPayload

    // Scenario 3: ignore everything except user.created
    if (payload.type !== 'user.created') {
      return reply.send({ data: { received: true } })
    }

    const { id, email, user_metadata } = payload.record
    const tenantId = user_metadata?.tenant_id
    const role = user_metadata?.role ?? 'user'

    try {
      // Resolve the final (tenantId, role) pair inside each scenario so we
      // can mirror them into app_metadata after the Prisma writes complete.
      let resolvedTenantId: string
      let resolvedRole: string

      if (tenantId) {
        // Scenario 2 — invited user: create users row for the existing tenant.
        // Uses upsert because POST /users/invite may have already created the row
        // (Supabase fires user.created immediately on invite, before our handler finishes).
        await prisma.user.upsert({
          where: { id },
          create: { id, tenantId, email, role },
          update: {},
        })
        resolvedTenantId = tenantId
        resolvedRole = role
      } else {
        // Scenario 1 — self-signup: create a new tenant + admin user in one transaction.
        const createdTenantId = await prisma.$transaction(async (tx) => {
          const emailPrefix = (email.split('@')[0] ?? 'user').replace(/[^a-z0-9]/gi, '')
          const displayName =
            emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) || 'My Company'
          const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

          const slug = await generateUniqueSlug(emailPrefix || 'tenant', tx as unknown as PrismaClient)

          const tenant = await tx.tenant.create({
            data: {
              name: displayName,
              slug,
              plan: 'trial',
              planStatus: 'active',
              trialEndsAt,
            },
          })

          // First user of the tenant is always admin
          await tx.user.upsert({
            where: { id },
            create: { id, tenantId: tenant.id, email, role: 'admin' },
            update: {},
          })

          return tenant.id
        })
        resolvedTenantId = createdTenantId
        resolvedRole = 'admin'
      }

      // Set app_metadata on the Supabase auth user so tenant_id + role
      // are available in the JWT without a custom JWT hook. Non-fatal —
      // if this fails the user exists in our DB and can re-login to retry.
      const supabaseAdmin = getSupabaseAdmin()
      const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        app_metadata: {
          tenant_id: resolvedTenantId,
          role: resolvedRole,
        },
      })
      if (metaError) {
        app.log.error(metaError, 'Failed to set app_metadata on user')
      }

      return reply.send({ data: { received: true } })
    } catch (err) {
      // Log internally; return 500 so Supabase retries on transient DB failures.
      app.log.error(err, 'auth webhook processing failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
    }
  })
}
