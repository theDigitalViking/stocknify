import Fastify, { type FastifyInstance } from 'fastify'

import { config } from './config.js'
import { registerPlugins } from './plugins/index.js'
import { authRoutes } from './routes/auth/index.js'
import { billingRoutes } from './routes/billing/index.js'
import { csvRoutes } from './routes/csv/index.js'
import { healthRoutes } from './routes/health.js'
import { integrationsRoutes } from './routes/integrations/index.js'
import { locationsRoutes } from './routes/locations/index.js'
import { notificationsRoutes } from './routes/notifications/index.js'
import { productsRoutes } from './routes/products/index.js'
import { rulesRoutes } from './routes/rules/index.js'
import { stockRoutes } from './routes/stock/index.js'
import { stockTypesRoutes } from './routes/stock-types/index.js'
import { tenantRoutes } from './routes/tenant/index.js'
import { webhookRoutes } from './routes/webhooks/index.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Redact sensitive fields from logs — never log credentials or tokens
      redact: ['req.headers.authorization', 'body.credentials', 'body.password'],
    },
    requestTimeout: 30000,
    trustProxy: true, // Required behind Hetzner/Nginx reverse proxy
  })

  // Register plugins first (cors, helmet, rate-limit, jwt, sensible)
  await registerPlugins(app)

  // All routes are under /v1 prefix
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes)
      await v1.register(authRoutes)
      await v1.register(tenantRoutes)
      await v1.register(productsRoutes)
      await v1.register(locationsRoutes)
      await v1.register(stockRoutes)
      await v1.register(stockTypesRoutes)
      await v1.register(integrationsRoutes)
      await v1.register(csvRoutes)
      await v1.register(rulesRoutes)
      await v1.register(notificationsRoutes)
      await v1.register(billingRoutes)
      await v1.register(webhookRoutes)
    },
    { prefix: '/v1' },
  )

  // Global not-found handler
  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    })
  })

  // Global error handler
  app.setErrorHandler((err, _request, reply) => {
    app.log.error(err)
    const statusCode = err.statusCode ?? 500
    void reply.code(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message:
          config.NODE_ENV === 'production' && statusCode >= 500
            ? 'An unexpected error occurred'
            : err.message,
      },
    })
  })

  return app
}
