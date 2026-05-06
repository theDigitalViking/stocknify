import { Queue, Worker, type Processor } from 'bullmq'
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

// Cycle 3-D — SFTP/FTP scheduled imports. Each schedule registers a repeatable
// job; the worker (apps/api/src/jobs/sftp-import.worker.ts) drains them.
// `attempts: 3` + exponential backoff applies to a single triggered execution;
// repeatable cron firings are independent, so a persistent failure does not
// snowball — it pauses until the next cron tick and creates an Incident.
export const SFTP_IMPORT_QUEUE_NAME = 'sftp-import'
export const SFTP_IMPORT_JOB_NAME = 'sftp-import'

export const sftpImportQueue = new Queue(SFTP_IMPORT_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

let _sftpImportWorker: Worker | null = null

// Lazily start the SFTP/FTP import worker. Gated by callers on
// `NODE_ENV !== 'test'` so vitest never reaches Redis. The worker handler is
// imported dynamically so the test harness — which imports queue.ts
// transitively via the schedule routes — does not load the real handler
// (which pulls Prisma + the import pipeline) just to register routes.
export async function startSftpImportWorker(): Promise<Worker | null> {
  if (_sftpImportWorker) return _sftpImportWorker
  try {
    const { processSftpImportJob } = await import('./sftp-import.worker.js')
    const handler: Processor = async (job) => {
      // BullMQ semantics: `attemptsMade` is the count of attempts that have
      // already failed when the handler is invoked. On the first attempt
      // it's 0; if the handler throws, BullMQ increments it and retries
      // until `attemptsMade >= attempts`. `isFinalAttempt` therefore is
      // true when the next failure will exhaust retries.
      const attempts = job.opts.attempts ?? 1
      const isFinalAttempt = job.attemptsMade + 1 >= attempts
      return processSftpImportJob(job.data, { isFinalAttempt })
    }
    _sftpImportWorker = new Worker(SFTP_IMPORT_QUEUE_NAME, handler, {
      connection: redis,
      concurrency: 4,
    })
    _sftpImportWorker.on('error', (err: Error) => {
      console.error('[sftp-import worker] error:', err.message)
    })
    return _sftpImportWorker
  } catch (err) {
    // Redis unreachable or worker module failed to load — log and return
    // null. The API stays up; scheduled imports degrade gracefully.
    console.error(
      '[sftp-import worker] failed to start:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
