import { randomUUID } from 'node:crypto'

import { PrismaClient } from '@prisma/client'

// Tenant-scoped tables — verified against apps/api/src/db/schema.prisma.
// System tables (stock_type_definitions, notification_templates, partners,
// _prisma_migrations) are seeded once in globalSetup and intentionally
// excluded from per-test truncation.
const TENANT_TABLES = [
  'tenants',
  'users',
  'products',
  'product_variants',
  'product_bundles',
  'batches',
  'locations',
  'storage_locations',
  'stock_levels',
  'stock_movements',
  'variant_location_config',
  'integrations',
  'integration_credentials',
  'integration_schedules',
  'integration_attribute_definitions',
  'integration_attribute_values',
  'external_references',
  'csv_mapping_templates',
  'rules',
  'rule_actions',
  'notification_channels',
  'notification_deliveries',
  'alerts',
  'incidents',
  'partner_users',
] as const

export const testDb = new PrismaClient()

export async function truncateAllTenantTables(client: PrismaClient = testDb): Promise<void> {
  const stmt = `TRUNCATE TABLE ${TENANT_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  try {
    await client.$executeRawUnsafe(stmt)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`[test] TRUNCATE failed: ${message}\nStatement: ${stmt}`)
  }
}

export interface CreatedTenant {
  tenant: {
    id: string
    name: string
    slug: string
  }
  user: {
    id: string
    email: string
    role: string
  }
}

export interface TestTenantOverrides {
  name?: string
  slug?: string
  plan?: 'trial' | 'starter' | 'growth' | 'enterprise'
  planStatus?: 'active' | 'past_due' | 'canceled' | 'trial_expired'
  userEmail?: string
  userRole?: 'admin' | 'manager' | 'viewer'
}

export async function createTestTenant(
  client: PrismaClient = testDb,
  overrides: TestTenantOverrides = {},
): Promise<CreatedTenant> {
  const suffix = randomUUID().slice(0, 8)
  const tenantId = randomUUID()
  const userId = randomUUID()

  const name = overrides.name ?? 'Test Tenant'
  const slug = overrides.slug ?? `test-tenant-${suffix}`
  const plan = overrides.plan ?? 'trial'
  const planStatus = overrides.planStatus ?? 'active'
  const userEmail = overrides.userEmail ?? `owner-${suffix}@test.local`
  const userRole = overrides.userRole ?? 'admin'

  await client.tenant.create({
    data: {
      id: tenantId,
      name,
      slug,
      plan,
      planStatus,
    },
  })

  await client.user.create({
    data: {
      id: userId,
      tenantId,
      email: userEmail,
      role: userRole,
    },
  })

  return {
    tenant: { id: tenantId, name, slug },
    user: { id: userId, email: userEmail, role: userRole },
  }
}
