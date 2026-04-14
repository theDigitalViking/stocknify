// STUB: implement in Phase 2
// This job delivers a single notification via the specified channel.
// It renders the message template, calls the channel adapter, and records
// the result in notification_deliveries.
//
// Job data shape:
//   { alertId: string; channelId: string; tenantId: string }

export type SendNotificationJobData = {
  alertId: string
  channelId: string
  tenantId: string
}
