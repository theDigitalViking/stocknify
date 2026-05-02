import { afterAll, beforeEach } from 'vitest'

import { testDb, truncateAllTenantTables } from './db.js'

beforeEach(async () => {
  await truncateAllTenantTables(testDb)
})

afterAll(async () => {
  await testDb.$disconnect()
})
