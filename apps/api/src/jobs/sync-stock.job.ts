// STUB: implement in Phase 2
// This job pulls stock levels from an integration connector and upserts them
// into stock_levels, then appends a record to stock_history.
//
// Job data shape:
//   { integrationId: string; tenantId: string }

export type SyncStockJobData = {
  integrationId: string
  tenantId: string
}
