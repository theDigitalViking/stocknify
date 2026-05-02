import type { FastifyInstance } from 'fastify'

import { buildApp } from '../server.js'

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}
