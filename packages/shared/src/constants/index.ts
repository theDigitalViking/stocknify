// ---------------------------------------------------------------------------
// Stock types — DYNAMIC, loaded from stock_type_definitions table at runtime.
// This list is for reference only. Do NOT use it as a Zod enum.
// New types can be added by tenants without code changes.
// ---------------------------------------------------------------------------
export const SYSTEM_STOCK_TYPE_KEYS = [
  'available',
  'physical',
  'reserved',
  'blocked',
  'in_transit',
  'pre_transit',
  'damaged',
  'expired',
] as const

export type SystemStockTypeKey = (typeof SYSTEM_STOCK_TYPE_KEYS)[number]

// ---------------------------------------------------------------------------
// Movement types — the reason a stock_level record changed
// ---------------------------------------------------------------------------
export const MOVEMENT_TYPES = [
  'inbound',
  'outbound',
  'correction',
  'transfer',
  'return',
  'disposal',
  'sync',
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

// ---------------------------------------------------------------------------
// Rule condition types
// ---------------------------------------------------------------------------
export const CONDITION_TYPES = [
  'stock_level',
  'days_until_expiry',
  'stock_type_transition',
] as const
export type ConditionType = (typeof CONDITION_TYPES)[number]

// ---------------------------------------------------------------------------
// Storage location types (bin / shelf / zone / collection)
// ---------------------------------------------------------------------------
export const STORAGE_LOCATION_TYPES = ['bin', 'shelf', 'zone', 'collection'] as const
export type StorageLocationType = (typeof STORAGE_LOCATION_TYPES)[number]

// ---------------------------------------------------------------------------
// Batch-agnostic export strategies
// ---------------------------------------------------------------------------
export const EXPORT_STRATEGIES = ['skip', 'dummy'] as const
export type ExportStrategy = (typeof EXPORT_STRATEGIES)[number]

// ---------------------------------------------------------------------------
// Integration types (connectors)
// ---------------------------------------------------------------------------
export const INTEGRATION_TYPES = [
  'shopify',
  'woocommerce',
  'xentral',
  'hive',
  'byrd',
  'zenfulfillment',
  'bigblue',
  'magento',
  'shipbob',
] as const
export type IntegrationType = (typeof INTEGRATION_TYPES)[number]

// ---------------------------------------------------------------------------
// Notification channel types
// ---------------------------------------------------------------------------
export const NOTIFICATION_CHANNEL_TYPES = ['email', 'slack', 'webhook', 'sms', 'in_app'] as const
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number]

// ---------------------------------------------------------------------------
// Rule comparison operators (for stock_level condition type)
// ---------------------------------------------------------------------------
export const RULE_OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq'] as const
export type RuleOperator = (typeof RULE_OPERATORS)[number]

// ---------------------------------------------------------------------------
// Subscription plans
// ---------------------------------------------------------------------------
export const PLANS = ['trial', 'starter', 'growth', 'enterprise'] as const
export type Plan = (typeof PLANS)[number]

// ---------------------------------------------------------------------------
// Subscription status values
// ---------------------------------------------------------------------------
export const PLAN_STATUSES = ['active', 'past_due', 'canceled', 'trialing', 'paused'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

// ---------------------------------------------------------------------------
// User roles within a tenant
// ---------------------------------------------------------------------------
export const USER_ROLES = ['admin', 'user', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

// ---------------------------------------------------------------------------
// Integration connection statuses
// ---------------------------------------------------------------------------
export const INTEGRATION_STATUSES = ['pending', 'active', 'error', 'paused'] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

// ---------------------------------------------------------------------------
// Alert lifecycle statuses
// ---------------------------------------------------------------------------
export const ALERT_STATUSES = ['sent', 'acknowledged', 'resolved'] as const
export type AlertStatus = (typeof ALERT_STATUSES)[number]

// ---------------------------------------------------------------------------
// Notification delivery statuses
// ---------------------------------------------------------------------------
export const DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

// ---------------------------------------------------------------------------
// Location types
// ---------------------------------------------------------------------------
export const LOCATION_TYPES = ['fulfiller', 'own_warehouse', 'virtual'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

// ---------------------------------------------------------------------------
// Plan feature limits — enforced server-side, never client-side-only
// ---------------------------------------------------------------------------
export const PLAN_LIMITS: Record<
  Plan,
  {
    integrations: number | null
    products: number | null
    rules: number | null
    notificationChannels: number | null
    syncIntervalMinutes: number
    stockMovementRetentionDays: number
  }
> = {
  trial: {
    integrations: 2,
    products: 500,
    rules: 5,
    notificationChannels: 2,
    syncIntervalMinutes: 60,
    stockMovementRetentionDays: 7,
  },
  starter: {
    integrations: 3,
    products: 1000,
    rules: 10,
    notificationChannels: 3,
    syncIntervalMinutes: 30,
    stockMovementRetentionDays: 30,
  },
  growth: {
    integrations: 10,
    products: 10000,
    rules: 50,
    notificationChannels: 10,
    syncIntervalMinutes: 5,
    stockMovementRetentionDays: 365,
  },
  enterprise: {
    integrations: null,
    products: null,
    rules: null,
    notificationChannels: null,
    syncIntervalMinutes: 1,
    stockMovementRetentionDays: 365,
  },
}
