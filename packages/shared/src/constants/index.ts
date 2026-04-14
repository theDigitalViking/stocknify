// Stock types representing the state of inventory units
export const STOCK_TYPES = ['available', 'reserved', 'blocked', 'in_transit', 'damaged'] as const
export type StockType = (typeof STOCK_TYPES)[number]

// Supported integration connectors
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

// Supported notification delivery channels
export const NOTIFICATION_CHANNEL_TYPES = ['email', 'slack', 'webhook', 'sms', 'in_app'] as const
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number]

// Rule comparison operators
export const RULE_OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq'] as const
export type RuleOperator = (typeof RULE_OPERATORS)[number]

// Subscription plans
export const PLANS = ['trial', 'starter', 'growth', 'enterprise'] as const
export type Plan = (typeof PLANS)[number]

// Subscription status values
export const PLAN_STATUSES = ['active', 'past_due', 'canceled', 'trialing', 'paused'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

// User roles within a tenant
export const USER_ROLES = ['admin', 'user', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

// Integration connection statuses
export const INTEGRATION_STATUSES = ['pending', 'active', 'error', 'paused'] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

// Alert lifecycle statuses
export const ALERT_STATUSES = ['sent', 'acknowledged', 'resolved'] as const
export type AlertStatus = (typeof ALERT_STATUSES)[number]

// Notification delivery statuses
export const DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

// Stock change reasons for audit history
export const STOCK_CHANGE_REASONS = ['sync', 'manual', 'webhook', 'adjustment'] as const
export type StockChangeReason = (typeof STOCK_CHANGE_REASONS)[number]

// Location types
export const LOCATION_TYPES = ['fulfiller', 'own_warehouse', 'virtual'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

// Plan feature limits — used server-side for enforcement
export const PLAN_LIMITS: Record<
  Plan,
  {
    integrations: number | null
    products: number | null
    rules: number | null
    notificationChannels: number | null
    syncIntervalMinutes: number
    stockHistoryDays: number | null
  }
> = {
  trial: {
    integrations: 2,
    products: 500,
    rules: 5,
    notificationChannels: 2,
    syncIntervalMinutes: 60,
    stockHistoryDays: 7,
  },
  starter: {
    integrations: 3,
    products: 1000,
    rules: 10,
    notificationChannels: 3,
    syncIntervalMinutes: 30,
    stockHistoryDays: 30,
  },
  growth: {
    integrations: 10,
    products: 10000,
    rules: 50,
    notificationChannels: 10,
    syncIntervalMinutes: 5,
    stockHistoryDays: 365,
  },
  enterprise: {
    integrations: null,
    products: null,
    rules: null,
    notificationChannels: null,
    syncIntervalMinutes: 1,
    stockHistoryDays: null,
  },
}
