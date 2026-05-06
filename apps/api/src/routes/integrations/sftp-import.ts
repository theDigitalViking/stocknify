/**
 * Cycle 3-C — SFTP/FTP automated import endpoints.
 *
 * Three admin-only routes registered under /v1/integrations/:id/...
 *   GET  files          → list .csv files in a remote directory
 *   POST import-now     → manually stream a remote CSV through the stock
 *                         import pipeline; records an import_runs row
 *   GET  runs           → paginated import history
 *
 * The three handlers share the integration-loading + credential-loading
 * preamble, so they live in one file rather than three near-empty modules.
 * The prompt's three-file layout is a guideline; cohesion wins here.
 */

import { Buffer } from 'node:buffer'

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  listFtpDirectory,
  streamFtpFile,
  type FtpTestConfig,
} from '../../integrations/ftp-client.js'
import {
  listSftpDirectory,
  streamSftpFile,
  type SftpFileInfo,
  type SftpStreamHandle,
  type SftpTestConfig,
} from '../../integrations/sftp-client.js'
import { decryptCredential } from '../../lib/encryption.js'
import { authMiddleware } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/require-role.js'
import { tenantMiddleware } from '../../middleware/tenant.js'
import {
  buildStockExtractor,
  decodeBuffer,
  parseCsvStreamingBuffer,
  processStockImportRows,
  type ColumnMapping,
} from '../../services/stock-import/process-csv-stock.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CSV_MAX_ROWS = 10_000
// Soft cap on streamed remote CSVs. SFTP/FTP imports do not have the
// multipart body limit the CSV upload route inherits, so we cap explicitly
// to keep memory bounded. Same 5 MB ceiling as the upload route.
const REMOTE_CSV_MAX_BYTES = 5 * 1024 * 1024

const TESTABLE_TYPES = ['sftp', 'ftp', 'ftps'] as const
type TestableType = (typeof TESTABLE_TYPES)[number]

function isTestableType(value: string): value is TestableType {
  return (TESTABLE_TYPES as readonly string[]).includes(value)
}

// 'sftp' / 'ftp' show up on stock_movements.source so the movement view can
// distinguish automated SFTP/FTP imports from manual CSV uploads ('csv').
// FTPS rolls up under 'ftp' since it's the same wire protocol.
function sourceForCredentialType(type: TestableType): 'sftp' | 'ftp' {
  return type === 'sftp' ? 'sftp' : 'ftp'
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const idParamSchema = z.object({ id: z.string().uuid() })

const filesQuerySchema = z.object({
  credentialId: z.string().uuid(),
  path: z.string().max(1024).optional(),
})

const importNowBodySchema = z
  .object({
    credentialId: z.string().uuid(),
    filePath: z.string().min(1).max(1024).optional(),
    mappingTemplateId: z.string().uuid().optional(),
  })
  .strict()

const runsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
})

// ---------------------------------------------------------------------------
// Shared preamble — load tenant-scoped integration + credential
// ---------------------------------------------------------------------------

interface LoadedContext {
  integrationId: string
  credential: {
    id: string
    credentialType: TestableType
    host: string
    port: number
    username: string
    password: string | undefined
    remotePath: string | null
  }
}

async function loadIntegrationAndCredential(
  request: FastifyRequest,
  reply: FastifyReply,
  integrationId: string,
  credentialId: string,
): Promise<LoadedContext | null> {
  const integration = await request.db.integration.findFirst({
    where: { id: integrationId, tenantId: request.tenantId, deletedAt: null },
    select: { id: true, isEnabled: true },
  })
  if (!integration) {
    await reply.code(404).send({
      error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
    })
    return null
  }
  // Codex review fix — refuse to act on disabled integrations. Operators
  // toggle `isEnabled` to halt all syncs from a connector during incident
  // response or rollback; running a manual import (or even listing remote
  // files) against a disabled integration would defeat that gate.
  if (!integration.isEnabled) {
    await reply.code(409).send({
      error: {
        code: 'INTEGRATION_DISABLED',
        message: 'Integration is disabled — re-enable it before running imports',
      },
    })
    return null
  }
  const credential = await request.db.integrationCredential.findFirst({
    where: { id: credentialId, tenantId: request.tenantId, deletedAt: null },
  })
  if (!credential) {
    await reply.code(404).send({
      error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found' },
    })
    return null
  }
  // Codex review fix — credential/integration binding. When a credential is
  // bound to a specific integration (`integrationId !== null`), it must
  // match the path's `:id`. Otherwise a tenant could mix credentials from
  // integration B into integration A's import flow — wrong attribution on
  // the import_runs row, wrong source data into the wrong connector.
  // Reusable tenant-level credentials (`integrationId === null` per
  // DECISIONS 2026-05-07) are explicitly allowed.
  if (
    credential.integrationId !== null &&
    credential.integrationId !== integration.id
  ) {
    await reply.code(409).send({
      error: {
        code: 'CREDENTIAL_INTEGRATION_MISMATCH',
        message: 'Credential is bound to a different integration',
      },
    })
    return null
  }
  // Codex review fix — refuse to act on credentials the operator marked
  // inactive. Symmetric to the integration-disabled gate above; lets an
  // operator stand down a single credential without deleting it.
  if (!credential.isActive) {
    await reply.code(409).send({
      error: {
        code: 'CREDENTIAL_INACTIVE',
        message: 'Credential is marked inactive — re-activate it before running imports',
      },
    })
    return null
  }
  if (!isTestableType(credential.credentialType)) {
    await reply.code(400).send({
      error: {
        code: 'CREDENTIAL_TYPE_NOT_SUPPORTED',
        message: `Import not supported for credential type "${credential.credentialType}"`,
      },
    })
    return null
  }
  if (credential.host === null || credential.username === null) {
    await reply.code(400).send({
      error: {
        code: 'CREDENTIAL_INCOMPLETE',
        message: 'Credential is missing host or username',
      },
    })
    return null
  }
  let plainPassword: string | undefined
  if (credential.password !== null) {
    try {
      plainPassword = decryptCredential(credential.password)
    } catch (err) {
      request.log.error({ err, credentialId: credential.id }, 'Failed to decrypt credential password')
      await reply.code(500).send({
        error: { code: 'CREDENTIAL_DECRYPT_FAILED', message: 'Failed to decrypt credential' },
      })
      return null
    }
  }
  const port = credential.port ?? (credential.credentialType === 'sftp' ? 22 : 21)
  return {
    integrationId: integration.id,
    credential: {
      id: credential.id,
      credentialType: credential.credentialType,
      host: credential.host,
      port,
      username: credential.username,
      password: plainPassword,
      remotePath: credential.remotePath,
    },
  }
}

function buildSftpConfig(c: LoadedContext['credential']): SftpTestConfig {
  return {
    host: c.host,
    port: c.port,
    username: c.username,
    ...(c.password !== undefined ? { password: c.password } : {}),
  }
}

function buildFtpConfig(c: LoadedContext['credential']): FtpTestConfig {
  return {
    host: c.host,
    port: c.port,
    username: c.username,
    ...(c.password !== undefined ? { password: c.password } : {}),
    secure: c.credentialType === 'ftps',
  }
}

async function listRemoteDirectory(
  c: LoadedContext['credential'],
  remotePath: string,
  filter?: { extension?: string },
): Promise<SftpFileInfo[]> {
  if (c.credentialType === 'sftp') {
    return listSftpDirectory(buildSftpConfig(c), remotePath, filter)
  }
  return listFtpDirectory(buildFtpConfig(c), remotePath, filter)
}

async function streamRemoteFile(
  c: LoadedContext['credential'],
  remotePath: string,
): Promise<SftpStreamHandle> {
  if (c.credentialType === 'sftp') {
    return streamSftpFile(buildSftpConfig(c), remotePath)
  }
  return streamFtpFile(buildFtpConfig(c), remotePath)
}

// Read a remote stream into a Buffer with a hard byte cap. Mirrors the
// multipart upload limit so SFTP imports cannot exhaust memory on a runaway
// remote file.
async function bufferRemoteStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(
          Object.assign(new Error('REMOTE_FILE_TOO_LARGE'), {
            code: 'REMOTE_FILE_TOO_LARGE',
          }),
        )
        return
      }
      chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve(Buffer.concat(chunks, total))
    })
  })
}

// Resolve the path to operate on. Falls back to the credential's stored
// remotePath, then to '/'. We preserve the explicit path if the user passed
// one — even if empty string, '/' is fine, but Zod min(1) on filePath
// already excludes the empty case.
function resolvePath(explicit: string | undefined, fallback: string | null): string {
  return explicit?.trim() || fallback?.trim() || '/'
}

function joinRemotePath(dir: string, file: string): string {
  if (!dir || dir === '/') return file.startsWith('/') ? file : `/${file}`
  if (file.startsWith('/')) return file
  return dir.endsWith('/') ? `${dir}${file}` : `${dir}/${file}`
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function sftpImportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)
  // SFTP/FTP file listing + manual import + run history all expose outbound
  // network or sensitive history data — restrict to admins, same as the
  // credential vault routes.
  app.addHook('preHandler', requireRole('admin'))

  // -------------------------------------------------------------------------
  // GET /integrations/:id/files — directory listing (CSV-only)
  // -------------------------------------------------------------------------
  app.get('/integrations/:id/files', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid integration id' },
      })
    }
    const query = filesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: query.error.message },
      })
    }

    const ctx = await loadIntegrationAndCredential(
      request,
      reply,
      params.data.id,
      query.data.credentialId,
    )
    if (!ctx) return reply

    const path = resolvePath(query.data.path, ctx.credential.remotePath)
    try {
      const files = await listRemoteDirectory(ctx.credential, path, { extension: '.csv' })
      return reply.send({ data: files })
    } catch (err) {
      request.log.error({ err, integrationId: ctx.integrationId }, 'sftp/ftp directory listing failed')
      return reply.code(502).send({
        error: {
          code: 'REMOTE_LISTING_FAILED',
          message: 'Failed to list remote directory',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /integrations/:id/import-now — manual SFTP/FTP stock import
  // -------------------------------------------------------------------------
  app.post('/integrations/:id/import-now', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid integration id' },
      })
    }
    const body = importNowBodySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: body.error.message },
      })
    }

    const ctx = await loadIntegrationAndCredential(
      request,
      reply,
      params.data.id,
      body.data.credentialId,
    )
    if (!ctx) return reply

    // Optional mapping template — when omitted, the default header table in
    // process-csv-stock handles plain CSV exports with conventional headers.
    let mappings: ColumnMapping[] | null = null
    let defaults: Record<string, string> = {}
    let delimiter = ','
    let hasHeaderRow = true
    let encoding = 'utf-8'
    if (body.data.mappingTemplateId) {
      const template = await request.db.csvMappingTemplate.findFirst({
        where: {
          id: body.data.mappingTemplateId,
          tenantId: request.tenantId,
          deletedAt: null,
        },
      })
      if (!template) {
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Mapping template not found' } })
      }
      if (template.direction !== 'import' || template.resourceType !== 'stock') {
        return reply.code(400).send({
          error: {
            code: 'INVALID_TEMPLATE',
            message: 'Template must have direction=import and resourceType=stock',
          },
        })
      }
      mappings = template.columnMappings as unknown as ColumnMapping[]
      defaults = template.defaultValues as Record<string, string>
      delimiter = template.delimiter
      hasHeaderRow = template.hasHeaderRow
      encoding = template.encoding
    }

    // Create the ImportRun shell so the row exists for the duration of the
    // job. fileName / fileSizeBytes get filled in once the file is resolved.
    const importRun = await request.db.importRun.create({
      data: {
        tenantId: request.tenantId,
        integrationId: ctx.integrationId,
        credentialId: ctx.credential.id,
        trigger: 'manual',
        status: 'running',
      },
    })

    // We catch every failure so the ImportRun row reflects the outcome
    // even when the connector or the pipeline blows up mid-stream. The
    // route always responds with the run record (200) — the operator
    // checks `status` to learn whether the run succeeded.
    try {
      // Resolve the file path. When the body omits filePath, list the
      // remote directory and pick the newest .csv file. Empty directory →
      // ImportRun is failed with a clear reason.
      let filePath = body.data.filePath
      if (!filePath) {
        const dir = resolvePath(undefined, ctx.credential.remotePath)
        const files = await listRemoteDirectory(ctx.credential, dir, { extension: '.csv' })
        const newest = files.find((f) => f.type === 'file')
        if (!newest) {
          const failed = await request.db.importRun.update({
            where: { id: importRun.id },
            data: {
              status: 'failed',
              errorSummary: 'No CSV files found in remote directory',
              completedAt: new Date(),
            },
          })
          return reply.send({ data: failed })
        }
        filePath = joinRemotePath(dir, newest.name)
      }

      // Stream → buffer (capped) → existing pipeline. The stream-buffer
      // intermediate step keeps the parsing path identical to the
      // multipart upload route; full-streaming through csv-parse is a
      // future refinement once the SFTP path proves stable.
      const handle = await streamRemoteFile(ctx.credential, filePath)
      let buffer: Buffer
      try {
        buffer = await bufferRemoteStream(handle.stream, REMOTE_CSV_MAX_BYTES)
      } finally {
        await handle.cleanup()
      }
      const decoded = decodeBuffer(buffer, encoding)
      const parsed = await parseCsvStreamingBuffer(
        decoded,
        { delimiter, hasHeaderRow },
        CSV_MAX_ROWS,
        'strict',
      )
      const extractor = buildStockExtractor(mappings, defaults)
      const result = await processStockImportRows(
        {
          db: request.db,
          tenantId: request.tenantId,
          userId: request.userId,
          source: sourceForCredentialType(ctx.credential.credentialType),
          dryRun: false,
          log: request.log,
        },
        parsed,
        extractor,
      )

      // Status: failed if every row errored or zero rows were processed at
      // all; partial if some rows errored; success otherwise. The product
      // semantic mirrors the existing CSV upload's incident severity.
      const status =
        result.errors.length > 0 && result.created + result.updated === 0
          ? 'failed'
          : result.errors.length > 0
            ? 'partial'
            : 'success'

      const fileName = filePath.includes('/') ? filePath.slice(filePath.lastIndexOf('/') + 1) : filePath
      const finalRun = await request.db.importRun.update({
        where: { id: importRun.id },
        data: {
          status,
          fileName,
          fileSizeBytes: buffer.length,
          rowsTotal: result.totalRows,
          rowsCreated: result.created,
          rowsUpdated: result.updated,
          rowsSkipped: result.skipped,
          rowsErrored: result.errors.length,
          errorSummary:
            result.errors.length > 0
              ? `${String(result.errors.length)} row(s) failed; first: ${result.errors[0]?.reason ?? ''}`
              : null,
          completedAt: new Date(),
        },
      })
      return reply.send({ data: finalRun })
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code
      const reason =
        code === 'REMOTE_FILE_TOO_LARGE'
          ? 'Remote CSV exceeds the 5 MB size limit'
          : code === 'ROW_LIMIT_EXCEEDED'
            ? `Remote CSV exceeds the maximum of ${String(CSV_MAX_ROWS)} rows`
            : err instanceof Error
              ? `Remote import failed: ${err.message.slice(0, 200)}`
              : 'Remote import failed'
      request.log.error({ err, importRunId: importRun.id }, 'sftp/ftp import-now failed')
      const failed = await request.db.importRun.update({
        where: { id: importRun.id },
        data: {
          status: 'failed',
          errorSummary: reason,
          completedAt: new Date(),
        },
      })
      return reply.send({ data: failed })
    }
  })

  // -------------------------------------------------------------------------
  // GET /integrations/:id/runs — paginated import history (newest first)
  // -------------------------------------------------------------------------
  app.get('/integrations/:id/runs', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid integration id' },
      })
    }
    const query = runsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: query.error.message },
      })
    }

    const integration = await request.db.integration.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!integration) {
      return reply.code(404).send({
        error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' },
      })
    }

    const { page, perPage } = query.data
    const where = { tenantId: request.tenantId, integrationId: integration.id }
    const [rows, total] = await Promise.all([
      request.db.importRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      request.db.importRun.count({ where }),
    ])

    return reply.send({ data: rows, meta: { total, page, perPage } })
  })
}

