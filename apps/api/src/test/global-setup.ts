import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

dotenv.config({
  path: fileURLToPath(new URL('../../.env.test', import.meta.url)),
  override: true,
})

const ALLOWED_TEST_HOSTS = new Set(['localhost', '127.0.0.1'])
const ALLOWED_TEST_PORT = '5433'
const ALLOWED_TEST_PROTOCOLS = new Set(['postgres:', 'postgresql:'])
const REQUIRED_TEST_DB_NAME = 'stocknify_test'

function assertTestDatabaseUrl(rawUrl: string | undefined): URL {
  if (!rawUrl) {
    throw new Error('[test] DATABASE_URL is not set — refusing to run migrations')
  }
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('[test] DATABASE_URL is not a valid URL — refusing to run migrations')
  }
  if (!ALLOWED_TEST_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `[test] Refusing to migrate against non-Postgres URL (protocol=${parsed.protocol}). ` +
        `Test DB must use postgres:/postgresql:.`,
    )
  }
  if (!ALLOWED_TEST_HOSTS.has(parsed.hostname) || parsed.port !== ALLOWED_TEST_PORT) {
    throw new Error(
      `[test] Refusing to migrate against non-test DB (host=${parsed.hostname}, port=${parsed.port || '<default>'}). ` +
        `Test DB must be on localhost:${ALLOWED_TEST_PORT}.`,
    )
  }
  // pathname is `/<dbname>`; strict allowlist on the database name catches a
  // forwarded prod/staging DB that happens to listen on localhost:5433.
  const dbName = parsed.pathname.replace(/^\//, '')
  if (dbName !== REQUIRED_TEST_DB_NAME) {
    throw new Error(
      `[test] Refusing to migrate against unexpected database "${dbName}". ` +
        `Test DB must be named "${REQUIRED_TEST_DB_NAME}".`,
    )
  }
  return parsed
}

export async function setup(): Promise<void> {
  assertTestDatabaseUrl(process.env.DATABASE_URL)

  const env = { ...process.env }

  const cwd = fileURLToPath(new URL('../..', import.meta.url))

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'src/db/schema.prisma'], {
    cwd,
    env,
    stdio: 'inherit',
  })

  execFileSync('pnpm', ['exec', 'tsx', 'src/db/run-manual-migrations.ts'], {
    cwd,
    env,
    stdio: 'inherit',
  })

  console.log('[test] DB ready')
}
