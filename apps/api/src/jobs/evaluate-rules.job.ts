// STUB: implement in Phase 2
// This job evaluates all active rules for a given product/location after a
// stock update. For each triggered rule it creates an alert and queues
// send-notification jobs for each rule_action.
//
// Job data shape:
//   { productId: string; locationId: string; tenantId: string }

export type EvaluateRulesJobData = {
  productId: string
  locationId: string
  tenantId: string
}
