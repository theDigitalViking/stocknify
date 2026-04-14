import { z } from 'zod'

import {
  ALERT_STATUSES,
  DELIVERY_STATUSES,
  INTEGRATION_STATUSES,
  INTEGRATION_TYPES,
  LOCATION_TYPES,
  NOTIFICATION_CHANNEL_TYPES,
  PLANS,
  PLAN_STATUSES,
  RULE_OPERATORS,
  STOCK_CHANGE_REASONS,
  STOCK_TYPES,
  USER_ROLES,
} from '../constants/index.js'

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid()
export const isoDateSchema = z.string().datetime()

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

// ---------------------------------------------------------------------------
// Enum schemas (derived from constants to keep them in sync)
// ---------------------------------------------------------------------------

export const stockTypeSchema = z.enum(STOCK_TYPES)
export const integrationTypeSchema = z.enum(INTEGRATION_TYPES)
export const notificationChannelTypeSchema = z.enum(NOTIFICATION_CHANNEL_TYPES)
export const ruleOperatorSchema = z.enum(RULE_OPERATORS)
export const planSchema = z.enum(PLANS)
export const planStatusSchema = z.enum(PLAN_STATUSES)
export const userRoleSchema = z.enum(USER_ROLES)
export const integrationStatusSchema = z.enum(INTEGRATION_STATUSES)
export const alertStatusSchema = z.enum(ALERT_STATUSES)
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES)
export const stockChangeReasonSchema = z.enum(STOCK_CHANGE_REASONS)
export const locationTypeSchema = z.enum(LOCATION_TYPES)

// ---------------------------------------------------------------------------
// Domain schemas
// ---------------------------------------------------------------------------

export const tenantSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/),
  plan: planSchema,
  planStatus: planStatusSchema,
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  trialEndsAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const userSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  email: z.string().email(),
  fullName: z.string().nullable(),
  role: userRoleSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const productSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  sku: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  description: z.string().nullable(),
  barcode: z.string().nullable(),
  unit: z.string().default('piece'),
  metadata: z.record(z.unknown()).default({}),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const locationSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1).max(255),
  type: locationTypeSchema,
  integrationId: uuidSchema.nullable(),
  address: z.record(z.unknown()).default({}),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const stockLevelSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  productId: uuidSchema,
  locationId: uuidSchema,
  stockType: stockTypeSchema,
  quantity: z.number(),
  lastSyncedAt: isoDateSchema.nullable(),
  source: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const stockHistorySchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  productId: uuidSchema,
  locationId: uuidSchema,
  stockType: stockTypeSchema,
  quantity: z.number(),
  delta: z.number().nullable(),
  reason: stockChangeReasonSchema.nullable(),
  createdAt: isoDateSchema,
})

export const integrationSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  type: integrationTypeSchema,
  name: z.string().min(1).max(255),
  status: integrationStatusSchema,
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()),
  lastSyncAt: isoDateSchema.nullable(),
  lastError: z.string().nullable(),
  syncIntervalMinutes: z.number().int().positive().default(15),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const ruleSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  isActive: z.boolean().default(true),
  productFilter: z.record(z.unknown()).default({}),
  locationFilter: z.record(z.unknown()).default({}),
  stockType: stockTypeSchema,
  operator: ruleOperatorSchema,
  threshold: z.number(),
  cooldownMinutes: z.number().int().nonnegative().default(60),
  lastTriggeredAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const ruleActionSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  ruleId: uuidSchema,
  channelId: uuidSchema,
  messageTemplate: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

// ---------------------------------------------------------------------------
// Notification channel config schemas (discriminated union)
// ---------------------------------------------------------------------------

export const emailChannelConfigSchema = z.object({
  type: z.literal('email'),
  to: z.array(z.string().email()).min(1),
  subject: z.string().optional(),
})

export const slackChannelConfigSchema = z.object({
  type: z.literal('slack'),
  webhookUrl: z.string().url(),
  channel: z.string().optional(),
})

export const webhookChannelConfigSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'PATCH']),
  headers: z.record(z.string()).optional(),
})

export const smsChannelConfigSchema = z.object({
  type: z.literal('sms'),
  phoneNumbers: z
    .array(z.string().regex(/^\+[1-9]\d{1,14}$/))
    .min(1),
})

export const inAppChannelConfigSchema = z.object({
  type: z.literal('in_app'),
})

export const notificationChannelConfigSchema = z.discriminatedUnion('type', [
  emailChannelConfigSchema,
  slackChannelConfigSchema,
  webhookChannelConfigSchema,
  smsChannelConfigSchema,
  inAppChannelConfigSchema,
])

export const notificationChannelSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1).max(255),
  type: notificationChannelTypeSchema,
  config: notificationChannelConfigSchema,
  isActive: z.boolean().default(true),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const alertSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  ruleId: uuidSchema,
  productId: uuidSchema,
  locationId: uuidSchema,
  triggeredQuantity: z.number().nullable(),
  threshold: z.number().nullable(),
  status: alertStatusSchema,
  acknowledgedBy: uuidSchema.nullable(),
  acknowledgedAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
})

export const notificationDeliverySchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  alertId: uuidSchema,
  channelId: uuidSchema,
  status: deliveryStatusSchema,
  error: z.string().nullable(),
  sentAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
})

// ---------------------------------------------------------------------------
// Mutation (request body) schemas — used for API validation
// ---------------------------------------------------------------------------

export const createProductSchema = z.object({
  sku: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  barcode: z.string().optional(),
  unit: z.string().default('piece'),
  metadata: z.record(z.unknown()).optional(),
})

export const updateProductSchema = createProductSchema.partial()

export const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  type: locationTypeSchema,
  integrationId: uuidSchema.optional(),
  address: z.record(z.unknown()).optional(),
})

export const updateLocationSchema = createLocationSchema.partial()

export const createIntegrationSchema = z.object({
  type: integrationTypeSchema,
  name: z.string().min(1).max(255),
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
  syncIntervalMinutes: z.number().int().positive().optional(),
})

export const updateIntegrationSchema = createIntegrationSchema.partial()

export const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  productFilter: z.record(z.unknown()).optional(),
  locationFilter: z.record(z.unknown()).optional(),
  stockType: stockTypeSchema,
  operator: ruleOperatorSchema,
  threshold: z.number(),
  cooldownMinutes: z.number().int().nonnegative().optional(),
  actions: z
    .array(
      z.object({
        channelId: uuidSchema,
        messageTemplate: z.string().optional(),
      }),
    )
    .optional(),
})

export const updateRuleSchema = createRuleSchema.partial()

export const createNotificationChannelSchema = z.object({
  name: z.string().min(1).max(255),
  type: notificationChannelTypeSchema,
  config: notificationChannelConfigSchema,
  isActive: z.boolean().optional(),
})

export const updateNotificationChannelSchema = createNotificationChannelSchema.partial()

export const upsertStockLevelSchema = z.object({
  productId: uuidSchema,
  locationId: uuidSchema,
  stockType: stockTypeSchema,
  quantity: z.number().nonnegative(),
  source: z.string().optional(),
})

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema.default('user'),
})

export const updateUserSchema = z.object({
  fullName: z.string().optional(),
  role: userRoleSchema.optional(),
})

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
})

// ---------------------------------------------------------------------------
// Inferred types from schemas (useful for form validation on the frontend)
// ---------------------------------------------------------------------------

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>
export type CreateRuleInput = z.infer<typeof createRuleSchema>
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>
export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelSchema>
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>
export type UpsertStockLevelInput = z.infer<typeof upsertStockLevelSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>
export type PaginationParams = z.infer<typeof paginationSchema>
