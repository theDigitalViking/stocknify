import type {
  AlertStatus,
  DeliveryStatus,
  IntegrationStatus,
  IntegrationType,
  LocationType,
  NotificationChannelType,
  Plan,
  PlanStatus,
  RuleOperator,
  StockChangeReason,
  StockType,
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

export interface Product {
  id: string
  tenantId: string
  sku: string
  name: string
  description: string | null
  barcode: string | null
  unit: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Location {
  id: string
  tenantId: string
  name: string
  type: LocationType
  integrationId: string | null
  address: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface StockLevel {
  id: string
  tenantId: string
  productId: string
  locationId: string
  stockType: StockType
  quantity: number
  lastSyncedAt: string | null
  source: string | null
  createdAt: string
  updatedAt: string
}

export interface StockHistory {
  id: string
  tenantId: string
  productId: string
  locationId: string
  stockType: StockType
  quantity: number
  delta: number | null
  reason: StockChangeReason | null
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
  productFilter: Record<string, unknown>
  locationFilter: Record<string, unknown>
  stockType: StockType
  operator: RuleOperator
  threshold: number
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
  productId: string
  locationId: string
  triggeredQuantity: number | null
  threshold: number | null
  status: AlertStatus
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  createdAt: string
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
// Integration connector interface (shared between API and connector packages)
// ---------------------------------------------------------------------------

export interface StockData {
  sku: string
  locationName: string
  stockType: StockType
  quantity: number
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

