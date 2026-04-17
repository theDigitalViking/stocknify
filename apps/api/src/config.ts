import { z } from 'zod'

// Validate all environment variables at startup.
// Throws if required vars are missing — fast-fail before the server starts.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_URL: z.string().url().default('http://localhost:3001'),

  // PostgreSQL
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  SUPABASE_WEBHOOK_SECRET: z.string().min(1),

  // Redis / BullMQ
  REDIS_URL: z.string().min(1),

  // Encryption key for integration credentials (hex string, 64 chars = 32 bytes)
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64 hex characters (32 bytes)'),

  // Stripe (optional until Billing phase ships)
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

  // Resend (optional until Email phase ships)
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  FROM_EMAIL: z.string().email().default('alerts@stocknify.app'),

  // Sentry (optional — omit in local dev)
  SENTRY_DSN: z.string().url().optional(),

  // Phase 2 — Twilio SMS (optional until Phase 2 ships)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
})

// Parse and freeze the config — application code imports from here, never from process.env
const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = Object.freeze(parsed.data)

export type Config = typeof config
