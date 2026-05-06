import { config } from './config.js'
import { startSftpImportWorker } from './jobs/queue.js'
import { buildApp } from './server.js'

async function main(): Promise<void> {
  const app = await buildApp()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
    console.log(`🚀 API server listening on port ${String(config.PORT)}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // Start the SFTP/FTP import worker after the server is up. Gated on a
  // non-test environment so vitest never reaches Redis. Failure here is
  // logged but does not crash the API — scheduled imports degrade until
  // Redis is reachable again, but the API stays up for the rest of the
  // surface (manual import, CRUD, etc).
  if (config.NODE_ENV !== 'test') {
    void startSftpImportWorker()
  }
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
