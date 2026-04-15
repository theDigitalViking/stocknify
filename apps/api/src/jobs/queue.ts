import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

import { config } from '../config.js'

// Shared Redis connection — used by both queues and the rate-limit plugin
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,          // Don't connect immediately on startup
  retryStrategy: (times) => {
    // Exponential backoff, max 30s between retries
    return Math.min(times * 1000, 30000)
  },
})

redis.on('error', (err: Error) => {
  // Log but don't crash — BullMQ will retry internally
  console.error('[Redis] connection error:', err.message)
})

// Queue definitions — job logic is implemented in Phase 2
export const syncStockQueue = new Queue('sync-stock', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

export const evaluateRulesQueue = new Queue('evaluate-rules', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

export const sendNotificationQueue = new Queue('send-notification', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 1000 },
  },
})
