import { config } from './config.js'
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
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
