import { z } from 'zod'

import {
  ALERT_STATUSES,
  CONDITION_TYPES,
  DELIVERY_STATUSES,
  EXPORT_STRATEGIES,
  INTEGRATION_STATUSES,
  INTEGRATION_TYPES,
  LOCATION_TYPES,
  MOVEMENT_TYPES,
  NOTIFICATION_CHANNEL_TYPES,
  PLANS,
  PLAN_STATUSES,
  RULE_OPERATORS,
  STORAGE_LOCATION_TYPES,
  USER_ROLES,
} from '../constants/index.js'

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid()
export const isoDateSchema = z.string().datetime()
// ISO date only (YYYY-MM-DD) — used for expiry/manufactured dates
export const isoDateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format')

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

// Stock type is a free-text string validated against stock_type_definitions.key
// at runtime. Use this wherever stock type appears in API validation.
export const stockTypeKeySchema = z.string().min(1).max(50)

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const integrationTypeSchema = z.enum(INTEGRATION_TYPES)
export const notificationChannelTypeSchema = z.enum(NOTIFICATION_CHANNEL_TYPES)
export const ruleOperatorSchema = z.enum(RULE_OPERATORS)
export const conditionTypeSchema = z.enum(CONDITION_TYPES)
export const planSchema = z.enum(PLANS)
export const planStatusSchema = z.enum(PLAN_STATUSES)
export const userRoleSchema = z.enum(USER_ROLES)
export const integrationStatusSchema = z.enum(INTEGRATION_STATUSES)
export const alertStatusSchema = z.enum(ALERT_STATUSES)
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES)
export const locationTypeSchema = z.enum(LOCATION_TYPES)
export const movementTypeSchema = z.enum(MOVEMENT_TYPES)
export const storageLocationTypeSchema = z.enum(STORAGE_LOCATION_TYPES)
export const exportStrategySchema = z.enum(EXPORT_STRATEGIES)

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
  bundleTracking: z.boolean(),
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

export const stockTypeDefinitionSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema.nullable(),
  key: stockTypeKeySchema,
  label: z.string().min(1).max(100),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const productSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1).max(500),
  description: z.string().nullable(),
  category: z.string().nullable(),
  unit: z.string().default('piece'),
  batchTracking: z.boolean(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const productVariantSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  productId: uuidSchema,
  sku: z.string().min(1).max(255),
  name: z.string().nullable(),
  barcode: z.string().nullable(),
  attributes: z.record(z.unknown()).default({}),
  isActive: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const productBundleSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  bundleVariantId: uuidSchema,
  componentVariantId: uuidSchema,
  quantity: z.number().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const batchSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  productId: uuidSchema,
  batchNumber: z.string().min(1).max(255),
  expiryDate: isoDateOnlySchema.nullable(),
  manufacturedDate: isoDateOnlySchema.nullable(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const locationSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1).max(255),
  type: locationTypeSchema,
  integrationId: uuidSchema.nullable(),
  binTrackingEnabled: z.boolean(),
  address: z.record(z.unknown()).default({}),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const storageLocationSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  locationId: uuidSchema,
  name: z.string().min(1).max(255),
  type: storageLocationTypeSchema,
  trackInventory: z.boolean(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
})

export const stockLevelSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  variantId: uuidSchema,
  locationId: uuidSchema,
  storageLocationId: uuidSchema.nullable(),
  batchId: uuidSchema.nullable(),
  stockType: stockTypeKeySchema,
  quantity: z.number(),
  lastSyncedAt: isoDateSchema.nullable(),
  source: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const stockMovementSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  variantId: uuidSchema,
  locationId: uuidSchema,
  storageLocationId: uuidSchema.nullable(),
  batchId: uuidSchema.nullable(),
  stockType: stockTypeKeySchema,
  quantityBefore: z.number(),
  quantityAfter: z.number(),
  delta: z.number(),
  movementType: movementTypeSchema,
  reason: z.string().nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  source: z.string().nullable(),
  createdBy: uuidSchema.nullable(),
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
  variantFilter: z.record(z.unknown()).default({}),
  locationFilter: z.record(z.unknown()).default({}),
  batchFilter: z.record(z.unknown()).default({}),
  conditionType: conditionTypeSchema,
  stockType: stockTypeKeySchema.nullable(),
  operator: ruleOperatorSchema.nullable(),
  threshold: z.number().nullable(),
  daysThreshold: z.number().int().nonnegative().nullable(),
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
  transitionToStockType: stockTypeKeySchema.nullable(),
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
  variantId: uuidSchema,
  locationId: uuidSchema,
  batchId: uuidSchema.nullable(),
  triggeredValue: z.number().nullable(),
  threshold: z.number().nullable(),
  status: alertStatusSchema,
  acknowledgedBy: uuidSchema.nullable(),
  acknowledgedAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
})

export const variantLocationConfigSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  variantId: uuidSchema,
  locationId: uuidSchema,
  batchRequired: z.boolean().default(false),
  exportStrategy: exportStrategySchema.default('skip'),
  dummyBatchNumber: z.string().nullable(),
  dummyExpiryOffsetDays: z.number().int().nonnegative().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
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
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().default('piece'),
  batchTracking: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateProductSchema = createProductSchema.partial()

export const createProductVariantSchema = z.object({
  productId: uuidSchema,
  sku: z.string().min(1).max(255),
  name: z.string().optional(),
  barcode: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
})

export const updateProductVariantSchema = createProductVariantSchema.omit({ productId: true }).partial()

export const createBatchSchema = z.object({
  productId: uuidSchema,
  batchNumber: z.string().min(1).max(255),
  expiryDate: isoDateOnlySchema.optional(),
  manufacturedDate: isoDateOnlySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateBatchSchema = createBatchSchema.omit({ productId: true }).partial()

export const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  type: locationTypeSchema,
  integrationId: uuidSchema.optional(),
  binTrackingEnabled: z.boolean().optional(),
  address: z.record(z.unknown()).optional(),
})

export const updateLocationSchema = createLocationSchema.partial()

export const createStorageLocationSchema = z.object({
  locationId: uuidSchema,
  name: z.string().min(1).max(255),
  type: storageLocationTypeSchema.optional(),
  trackInventory: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const updateStorageLocationSchema = createStorageLocationSchema
  .omit({ locationId: true })
  .partial()

export const createIntegrationSchema = z.object({
  type: integrationTypeSchema,
  name: z.string().min(1).max(255),
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
  syncIntervalMinutes: z.number().int().positive().optional(),
})

export const updateIntegrationSchema = createIntegrationSchema.partial()

export const createRuleSchema = z.discriminatedUnion('conditionType', [
  // stock_level rule — requires stockType, operator, threshold
  z.object({
    conditionType: z.literal('stock_level'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    variantFilter: z.record(z.unknown()).optional(),
    locationFilter: z.record(z.unknown()).optional(),
    batchFilter: z.record(z.unknown()).optional(),
    stockType: stockTypeKeySchema,
    operator: ruleOperatorSchema,
    threshold: z.number(),
    cooldownMinutes: z.number().int().nonnegative().optional(),
    actions: z
      .array(
        z.object({
          channelId: uuidSchema,
          messageTemplate: z.string().optional(),
          transitionToStockType: stockTypeKeySchema.optional(),
        }),
      )
      .optional(),
  }),
  // days_until_expiry rule — requires daysThreshold
  z.object({
    conditionType: z.literal('days_until_expiry'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    variantFilter: z.record(z.unknown()).optional(),
    locationFilter: z.record(z.unknown()).optional(),
    batchFilter: z.record(z.unknown()).optional(),
    daysThreshold: z.number().int().nonnegative(),
    cooldownMinutes: z.number().int().nonnegative().optional(),
    actions: z
      .array(
        z.object({
          channelId: uuidSchema,
          messageTemplate: z.string().optional(),
          transitionToStockType: stockTypeKeySchema.optional(),
        }),
      )
      .optional(),
  }),
  // stock_type_transition rule — no threshold required
  z.object({
    conditionType: z.literal('stock_type_transition'),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    variantFilter: z.record(z.unknown()).optional(),
    locationFilter: z.record(z.unknown()).optional(),
    batchFilter: z.record(z.unknown()).optional(),
    stockType: stockTypeKeySchema.optional(),
    cooldownMinutes: z.number().int().nonnegative().optional(),
    actions: z
      .array(
        z.object({
          channelId: uuidSchema,
          messageTemplate: z.string().optional(),
          transitionToStockType: stockTypeKeySchema,
        }),
      )
      .optional(),
  }),
])

export const createNotificationChannelSchema = z.object({
  name: z.string().min(1).max(255),
  type: notificationChannelTypeSchema,
  config: notificationChannelConfigSchema,
  isActive: z.boolean().optional(),
})

export const updateNotificationChannelSchema = createNotificationChannelSchema.partial()

export const upsertStockLevelSchema = z.object({
  variantId: uuidSchema,
  locationId: uuidSchema,
  storageLocationId: uuidSchema.optional(),
  batchId: uuidSchema.optional(),
  stockType: stockTypeKeySchema,
  quantity: z.number().nonnegative(),
  source: z.string().optional(),
})

export const createVariantLocationConfigSchema = z.object({
  variantId: uuidSchema,
  locationId: uuidSchema,
  batchRequired: z.boolean().optional(),
  exportStrategy: exportStrategySchema.optional(),
  dummyBatchNumber: z.string().optional(),
  dummyExpiryOffsetDays: z.number().int().nonnegative().optional(),
})

export const updateVariantLocationConfigSchema = createVariantLocationConfigSchema
  .omit({ variantId: true, locationId: true })
  .partial()

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema.default('user'),
})

export const updateUserSchema = z.object({
  fullName: z.string().optional(),
  role: userRoleSchema.optional(),
  locale: z.string().min(2).max(10).optional(),
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

export const createStockTypeDefinitionSchema = z.object({
  key: stockTypeKeySchema,
  label: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sortOrder: z.number().int().nonnegative().optional(),
})

// ---------------------------------------------------------------------------
// Inferred types from mutation schemas
// ---------------------------------------------------------------------------

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>
export type CreateBatchInput = z.infer<typeof createBatchSchema>
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>
export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type CreateStorageLocationInput = z.infer<typeof createStorageLocationSchema>
export type UpdateStorageLocationInput = z.infer<typeof updateStorageLocationSchema>
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>
export type CreateRuleInput = z.infer<typeof createRuleSchema>
export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelSchema>
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>
export type UpsertStockLevelInput = z.infer<typeof upsertStockLevelSchema>
export type CreateVariantLocationConfigInput = z.infer<typeof createVariantLocationConfigSchema>
export type UpdateVariantLocationConfigInput = z.infer<typeof updateVariantLocationConfigSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>
export type CreateStockTypeDefinitionInput = z.infer<typeof createStockTypeDefinitionSchema>
export type PaginationParams = z.infer<typeof paginationSchema>
