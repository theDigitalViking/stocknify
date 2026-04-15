import type {
  AlertStatus,
  ConditionType,
  DeliveryStatus,
  ExportStrategy,
  IntegrationStatus,
  IntegrationType,
  LocationType,
  MovementType,
  NotificationChannelType,
  Plan,
  PlanStatus,
  RuleOperator,
  StorageLocationType,
  UserRole,
} from '../constants/index.js'

// ---------------------------------------------------------------------------
// Core domain interfaces — mirrors the database schema in camelCase
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: Plan
  planStatus: PlanStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  trialEndsAt: string | null
  bundleTracking: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface User {
  id: string
  tenantId: string
  email: string
  fullName: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface StockTypeDefinition {
  id: string
  tenantId: string | null // null = system default
  key: string
  label: string
  description: string | null
  isSystem: boolean
  color: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// Product — master data record. SKU lives on ProductVariant.
// A simple product always has exactly one auto-created default variant.
export interface Product {
  id: string
  tenantId: string
  name: string
  description: string | null
  category: string | null
  unit: string
  batchTracking: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// ProductVariant — SKU level (size, color, etc.)
export interface ProductVariant {
  id: string
  tenantId: string
  productId: string
  sku: string
  name: string | null // null for single-variant products
  barcode: string | null
  attributes: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// ProductBundle — which variants make up a bundle and in what quantity.
// Business logic deferred to Phase 3; controlled by tenants.bundleTracking.
export interface ProductBundle {
  id: string
  tenantId: string
  bundleVariantId: string
  componentVariantId: string
  quantity: number
  createdAt: string
  updatedAt: string
}

export interface Batch {
  id: string
  tenantId: string
  productId: string
  batchNumber: string
  expiryDate: string | null // ISO date string (YYYY-MM-DD)
  manufacturedDate: string | null // ISO date string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Location {
  id: string
  tenantId: string
  name: string
  type: LocationType
  integrationId: string | null
  binTrackingEnabled: boolean
  address: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface StorageLocation {
  id: string
  tenantId: string
  locationId: string
  name: string
  type: StorageLocationType
  trackInventory: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// StockLevel — current quantity. Uniqueness enforced by COALESCE index in DB.
export interface StockLevel {
  id: string
  tenantId: string
  variantId: string
  locationId: string
  storageLocationId: string | null
  batchId: string | null
  stockType: string // references stock_type_definitions.key
  quantity: number
  lastSyncedAt: string | null
  source: string | null
  createdAt: string
  updatedAt: string
}

// StockMovement — append-only audit record for every stock change
export interface StockMovement {
  id: string
  tenantId: string
  variantId: string
  locationId: string
  storageLocationId: string | null
  batchId: string | null
  stockType: string
  quantityBefore: number
  quantityAfter: number
  delta: number
  movementType: MovementType
  reason: string | null
  referenceType: string | null
  referenceId: string | null
  source: string | null
  createdBy: string | null
  createdAt: string
}

export interface Integration {
  id: string
  tenantId: string
  type: IntegrationType
  name: string
  status: IntegrationStatus
  /** AES-256-GCM encrypted in the database — never expose raw credentials to clients */
  credentials: Record<string, unknown>
  config: Record<string, unknown>
  lastSyncAt: string | null
  lastError: string | null
  syncIntervalMinutes: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Rule {
  id: string
  tenantId: string
  name: string
  description: string | null
  isActive: boolean
  variantFilter: Record<string, unknown>
  locationFilter: Record<string, unknown>
  batchFilter: Record<string, unknown>
  conditionType: ConditionType
  stockType: string | null // required for stock_level condition
  operator: RuleOperator | null // required for stock_level condition
  threshold: number | null // required for stock_level condition
  daysThreshold: number | null // required for days_until_expiry condition
  cooldownMinutes: number
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface RuleAction {
  id: string
  tenantId: string
  ruleId: string
  channelId: string
  messageTemplate: string | null
  // For stock_type_transition rules: auto-reclassify stock to this type
  transitionToStockType: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationChannel {
  id: string
  tenantId: string
  name: string
  type: NotificationChannelType
  config: NotificationChannelConfig
  isActive: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Alert {
  id: string
  tenantId: string
  ruleId: string
  variantId: string
  locationId: string
  batchId: string | null
  triggeredValue: number | null // quantity or days_until_expiry
  threshold: number | null
  status: AlertStatus
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  createdAt: string
}

export interface VariantLocationConfig {
  id: string
  tenantId: string
  variantId: string
  locationId: string
  batchRequired: boolean
  exportStrategy: ExportStrategy
  dummyBatchNumber: string | null
  dummyExpiryOffsetDays: number | null
  createdAt: string
  updatedAt: string
}

export interface NotificationDelivery {
  id: string
  tenantId: string
  alertId: string
  channelId: string
  status: DeliveryStatus
  error: string | null
  sentAt: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Discriminated union for notification channel configs
// ---------------------------------------------------------------------------

export interface EmailChannelConfig {
  type: 'email'
  to: string[]
  subject?: string
}

export interface SlackChannelConfig {
  type: 'slack'
  webhookUrl: string
  channel?: string
}

export interface WebhookChannelConfig {
  type: 'webhook'
  url: string
  method: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
}

export interface SmsChannelConfig {
  type: 'sms'
  phoneNumbers: string[]
}

export interface InAppChannelConfig {
  type: 'in_app'
}

export type NotificationChannelConfig =
  | EmailChannelConfig
  | SlackChannelConfig
  | WebhookChannelConfig
  | SmsChannelConfig
  | InAppChannelConfig

// ---------------------------------------------------------------------------
// API response envelope types
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  data: T
  meta: Record<string, unknown>
}

export interface ApiListResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    perPage: number
  }
}

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}

// ---------------------------------------------------------------------------
// Integration connector interface
// ---------------------------------------------------------------------------

// StockData returned by connector.fetchStockLevels() — stock type is a string
// validated against stock_type_definitions.key at runtime, not a fixed enum.
export interface StockData {
  sku: string
  locationName: string
  stockType: string
  quantity: number
  batchNumber?: string
  expiryDate?: string // ISO date string (YYYY-MM-DD)
  storageLocation?: string // bin/shelf name
}

export interface AbstractConnector {
  readonly type: string
  readonly displayName: string
  readonly direction: 'source' | 'target' | 'bidirectional'
  validateCredentials(credentials: unknown): Promise<boolean>
  setupWebhooks?(integrationId: string): Promise<void>
  fetchStockLevels(): Promise<StockData[]>
  fetchProducts?(): Promise<Array<{ sku: string; name: string }>>
  parseWebhook?(payload: unknown, signature: string): Promise<StockData[] | null>
}
