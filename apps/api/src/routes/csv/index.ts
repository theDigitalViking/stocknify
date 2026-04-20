import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { Prisma, type CsvMappingTemplate, type PrismaClient } from '@prisma/client'
import { parse as csvParseStream } from 'csv-parse'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import iconv from 'iconv-lite'
import { z } from 'zod'

import { getSupabaseAdmin } from '../../lib/supabase-admin.js'
import { authMiddleware } from '../../middleware/auth.js'
import { tenantMiddleware } from '../../middleware/tenant.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CSV_MAX_ROWS = 10_000
const CSV_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB — duplicated from plugins
const CSV_PREVIEW_ROWS = 5
const CSV_INTEGRATION_TYPE = 'csv'
const ALLOWED_MIME_TYPES = new Set(['text/csv', 'application/csv', 'text/plain'])
// Re-check integration enablement every N rows to close the TOCTOU gap.
// A per-row check would add O(n) DB queries for large imports — not acceptable
// at 10,000 rows. N=10 bounds the worst-case unauthorized window to 9 rows,
// which is an acceptable tradeoff for MVP. Post-v1.0 can enforce this
// transactionally if required.
const INTEGRATION_RECHECK_INTERVAL = 10

// Product import field dictionary. `required: true` fields must be covered by
// either a CSV column mapping or a default value on the template.
const PRODUCT_IMPORT_FIELDS = [
  { key: 'name', label: 'Product name', required: true },
  { key: 'sku', label: 'SKU', required: true },
  { key: 'barcode', label: 'EAN / Barcode', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'unit', label: 'Unit', required: false },
  { key: 'batchTracking', label: 'MHD / Batch tracking', required: false },
] as const

type ProductImportField = (typeof PRODUCT_IMPORT_FIELDS)[number]['key']

// Default header names used when no mapping template is selected.
const DEFAULT_PRODUCT_HEADERS: Record<string, ProductImportField> = {
  name: 'name',
  sku: 'sku',
  barcode: 'barcode',
  description: 'description',
  category: 'category',
  unit: 'unit',
  batchTracking: 'batchTracking',
}

// Coerce CSV-shaped truthy/falsy strings ("true"/"1"/"ja"/"yes" etc.) into a
// boolean. Returns `undefined` on anything we can't confidently classify so
// the caller can fall back to defaults instead of guessing.
function parseBatchTracking(value: string | undefined): boolean | undefined {
  if (!value) return undefined
  const lower = value.toLowerCase().trim()
  if (['true', '1', 'ja', 'yes'].includes(lower)) return true
  if (['false', '0', 'nein', 'no'].includes(lower)) return false
  return undefined
}

// Supported encodings. Any unknown value falls back to utf-8 to prevent
// iconv-lite from throwing on attacker-controlled input.
const SUPPORTED_ENCODINGS = new Set(['utf-8', 'utf8', 'iso-8859-1', 'latin1', 'windows-1252'])

/**
 * Decode a file buffer to a UTF-8 string using the given encoding label,
 * then re-encode as a UTF-8 Buffer for the streaming CSV parser.
 * Falls back to utf-8 for any unrecognised encoding string.
 */
function decodeBuffer(buffer: Buffer, encoding: string): Buffer {
  const enc = encoding.toLowerCase().trim()
  if (!SUPPORTED_ENCODINGS.has(enc) || enc === 'utf-8' || enc === 'utf8') {
    return buffer
  }
  const decoded = iconv.decode(buffer, enc)
  return Buffer.from(decoded, 'utf-8')
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const columnMappingSchema = z.object({
  csvColumn: z.string().nullable(),
  field: z.string().min(1),
  required: z.boolean(),
  defaultValue: z.string().optional(),
})

const sampleDataSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
})

const createMappingSchema = z.object({
  name: z.string().min(1).max(200),
  direction: z.enum(['import', 'export']),
  resourceType: z.enum(['products', 'stock', 'locations']),
  delimiter: z.string().length(1).default(','),
  encoding: z.string().default('utf-8'),
  hasHeaderRow: z.boolean().default(true),
  columnMappings: z.array(columnMappingSchema).min(1),
  defaultValues: z.record(z.string()).default({}),
  sampleData: sampleDataSchema.optional(),
})

const updateMappingSchema = createMappingSchema.partial()

const listMappingQuerySchema = z.object({
  direction: z.enum(['import', 'export']).optional(),
  resourceType: z.enum(['products', 'stock', 'locations']).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ColumnMapping = z.infer<typeof columnMappingSchema>

function validateRequiredMappings(
  mappings: ColumnMapping[],
  defaults: Record<string, string>,
  resourceType: 'products' | 'stock' | 'locations',
): string | null {
  if (resourceType !== 'products') {
    // Stock/locations mapping validation is deferred to a later phase.
    return null
  }
  for (const spec of PRODUCT_IMPORT_FIELDS) {
    if (!spec.required) continue
    const mapping = mappings.find((m) => m.field === spec.key)
    const hasColumn = Boolean(mapping?.csvColumn)
    const hasDefault = Boolean(mapping?.defaultValue) || Boolean(defaults[spec.key])
    if (!hasColumn && !hasDefault) {
      return `Required field "${spec.label}" must be mapped to a CSV column or given a default value`
    }
  }
  return null
}

// Parse a CSV buffer into headers + rows with a hard cap enforced DURING
// parsing, not after. The synchronous parser materialised the whole file into
// memory before any row-count check could fire, which let a 5 MB CSV of
// single-character rows inflate into millions of string arrays before we
// rejected it. Streaming + early-destroy bounds the worst-case heap to
// O(maxRows × widest row).
//
// `mode = 'strict'` rejects with a `ROW_LIMIT_EXCEEDED` error as soon as the
// source yields more than `maxRows` data rows — used by the import endpoint
// so the caller gets a 413.
// `mode = 'truncate'` returns exactly `maxRows` rows and discards the rest
// silently — used by the preview endpoint where "there's more" is not a
// failure condition.
async function parseCsvStreaming(
  buffer: Buffer,
  opts: { delimiter: string; hasHeaderRow: boolean },
  maxRows: number,
  mode: 'strict' | 'truncate',
): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const parser = csvParseStream({
      delimiter: opts.delimiter,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })

    const rows: string[][] = []
    let headers: string[] = []
    let sawHeaderRow = false
    let settled = false

    function synthesiseHeadersIfNeeded(): void {
      if (opts.hasHeaderRow) return
      if (headers.length > 0) return
      const maxCols = rows.reduce((acc, row) => Math.max(acc, row.length), 0)
      headers = Array.from({ length: maxCols }, (_, i) => `col${String(i + 1)}`)
    }

    function finish(action: () => void): void {
      if (settled) return
      settled = true
      parser.destroy()
      action()
    }

    parser.on('readable', () => {
      let record: string[] | null
      while ((record = parser.read() as string[] | null) !== null) {
        if (settled) return
        if (opts.hasHeaderRow && !sawHeaderRow) {
          headers = record
          sawHeaderRow = true
          continue
        }
        if (rows.length >= maxRows) {
          if (mode === 'strict') {
            const err = new Error('ROW_LIMIT_EXCEEDED') as Error & { code: string }
            err.code = 'ROW_LIMIT_EXCEEDED'
            finish(() => {
              reject(err)
            })
          } else {
            synthesiseHeadersIfNeeded()
            finish(() => {
              resolve({ headers, rows })
            })
          }
          return
        }
        rows.push(record)
      }
    })

    parser.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })

    parser.on('end', () => {
      if (settled) return
      settled = true
      synthesiseHeadersIfNeeded()
      resolve({ headers, rows })
    })

    Readable.from(buffer).pipe(parser)
  })
}

// Read all parts from a multipart request into a file buffer + text fields.
// Enforces mime-type allowlist and the 5 MB size ceiling in addition to the
// plugin-level cap (which throws synchronously once the body exceeds the
// limit — we still early-return on a truncated stream here for belt-and-braces).
async function readMultipart(request: FastifyRequest): Promise<{
  file: { filename: string; mimeType: string; buffer: Buffer } | null
  fields: Record<string, string>
}> {
  const fields: Record<string, string> = {}
  let fileResult: { filename: string; mimeType: string; buffer: Buffer } | null = null

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      const mimeType = part.mimetype.toLowerCase()
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        // Drain to unlock the multipart stream before erroring
        part.file.resume()
        throw new MultipartUserError(415, 'UNSUPPORTED_MEDIA_TYPE', `Unsupported mime type: ${mimeType}`)
      }
      const chunks: Buffer[] = []
      let total = 0
      for await (const chunk of part.file) {
        const buf = chunk as Buffer
        total += buf.length
        if (total > CSV_MAX_FILE_SIZE_BYTES) {
          throw new MultipartUserError(413, 'FILE_TOO_LARGE', 'CSV file exceeds the 5 MB limit')
        }
        chunks.push(buf)
      }
      if (part.file.truncated) {
        throw new MultipartUserError(413, 'FILE_TOO_LARGE', 'CSV file exceeds the 5 MB limit')
      }
      fileResult = {
        filename: part.filename,
        mimeType,
        buffer: Buffer.concat(chunks, total),
      }
    } else {
      // Text field — value is already a string on the fastify/multipart v8 body
      fields[part.fieldname] = String(part.value)
    }
  }

  return { file: fileResult, fields }
}

class MultipartUserError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

// Find-or-create the tenant's CSV integration. Returns the integration row.
async function ensureCsvIntegration(
  db: PrismaClient,
  tenantId: string,
): Promise<Prisma.IntegrationGetPayload<object>> {
  const existing = await db.integration.findFirst({
    where: { tenantId, type: CSV_INTEGRATION_TYPE, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing
  return db.integration.create({
    data: {
      tenantId,
      type: CSV_INTEGRATION_TYPE,
      name: 'CSV Import / Export',
      status: 'active',
      credentials: {} as Prisma.InputJsonObject,
      config: {} as Prisma.InputJsonObject,
    },
  })
}

// Build the per-row field extractor. Returns a function that maps a raw CSV
// row (keyed by header) to a partial product payload, applying the template's
// column mappings and default values.
type RowExtractor = (row: Record<string, string | undefined>) => Partial<Record<ProductImportField, string>>

function buildExtractor(
  mappings: ColumnMapping[] | null,
  defaults: Record<string, string>,
): RowExtractor {
  if (!mappings) {
    return (row) => {
      const out: Partial<Record<ProductImportField, string>> = {}
      for (const [header, field] of Object.entries(DEFAULT_PRODUCT_HEADERS)) {
        const value = row[header]?.trim()
        if (value) out[field] = value
      }
      return out
    }
  }
  return (row) => {
    const out: Partial<Record<ProductImportField, string>> = {}
    for (const m of mappings) {
      const field = m.field as ProductImportField
      if (!isProductImportField(field)) continue
      const raw = m.csvColumn ? row[m.csvColumn]?.trim() : undefined
      const fallback = m.defaultValue?.trim() || defaults[field]?.trim()
      const value = raw || fallback
      if (value) out[field] = value
    }
    // Apply any defaults for fields that weren't in the mappings array.
    for (const [field, value] of Object.entries(defaults)) {
      if (!isProductImportField(field)) continue
      if (out[field]) continue
      const trimmed = value.trim()
      if (trimmed) out[field] = trimmed
    }
    return out
  }
}

function isProductImportField(value: string): value is ProductImportField {
  return PRODUCT_IMPORT_FIELDS.some((f) => f.key === value)
}

// Raw row shape returned by $queryRaw against csv_mapping_templates. Column
// names come back snake_case; mapTemplateRowToCamel normalises them back to
// the Prisma client shape so callers can treat them uniformly.
interface CsvMappingTemplateRow {
  id: string
  tenant_id: string
  name: string
  direction: string
  resource_type: string
  delimiter: string
  encoding: string
  has_header_row: boolean
  column_mappings: Prisma.JsonValue
  default_values: Prisma.JsonValue
  sample_data: Prisma.JsonValue | null
  is_locked: boolean
  marketplace_key: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

// For locked templates, verify the source marketplace integration is still
// enabled and not soft-deleted. Returns a reply on failure (403), or null on
// success so the caller can continue. Non-locked or non-marketplace templates
// pass through untouched.
async function ensureMarketplaceIntegrationEnabled(
  db: PrismaClient,
  tenantId: string,
  template: { isLocked: boolean; marketplaceKey: string | null },
  reply: FastifyReply,
): Promise<FastifyReply | null> {
  if (!template.isLocked || !template.marketplaceKey) return null
  const integration = await db.integration.findFirst({
    where: {
      tenantId,
      marketplaceKey: template.marketplaceKey,
      isEnabled: true,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (!integration) {
    return reply.code(403).send({
      error: {
        code: 'INTEGRATION_DISABLED',
        message: 'This template belongs to a disabled integration and cannot be used.',
      },
    })
  }
  return null
}

function mapTemplateRowToCamel(row: CsvMappingTemplateRow): CsvMappingTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    direction: row.direction,
    resourceType: row.resource_type,
    delimiter: row.delimiter,
    encoding: row.encoding,
    hasHeaderRow: row.has_header_row,
    columnMappings: row.column_mappings,
    defaultValues: row.default_values,
    sampleData: row.sample_data,
    isLocked: row.is_locked,
    marketplaceKey: row.marketplace_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function csvRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', tenantMiddleware)

  // -------------------------------------------------------------------------
  // POST /integrations/csv/init — create or return the tenant's CSV integration
  // -------------------------------------------------------------------------
  app.post('/integrations/csv/init', async (request, reply) => {
    try {
      const integration = await ensureCsvIntegration(request.db, request.tenantId)
      return reply.send({ data: integration })
    } catch (err) {
      request.log.error({ err }, 'csv init failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to initialise CSV integration' } })
    }
  })

  // -------------------------------------------------------------------------
  // GET /csv-mappings — list mapping templates (optional direction/resourceType filter)
  // -------------------------------------------------------------------------
  app.get('/csv-mappings', async (request, reply) => {
    const parsed = listMappingQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    }
    try {
      // Own, non-locked templates for this tenant.
      const templates = await request.db.csvMappingTemplate.findMany({
        where: {
          tenantId: request.tenantId,
          deletedAt: null,
          isLocked: false,
          ...(parsed.data.direction ? { direction: parsed.data.direction } : {}),
          ...(parsed.data.resourceType ? { resourceType: parsed.data.resourceType } : {}),
        },
        orderBy: { createdAt: 'desc' },
      })

      // Locked templates from marketplace integrations that are currently
      // enabled — enforced in ONE statement so there is no window where a
      // toggle of `isEnabled` between two sequential queries could leak a
      // template whose integration is no longer active.
      const directionFilter = parsed.data.direction
        ? Prisma.sql`AND cmt.direction = ${parsed.data.direction}`
        : Prisma.empty
      const resourceTypeFilter = parsed.data.resourceType
        ? Prisma.sql`AND cmt.resource_type = ${parsed.data.resourceType}`
        : Prisma.empty
      const rawLocked = await request.db.$queryRaw<CsvMappingTemplateRow[]>`
        SELECT cmt.*
        FROM csv_mapping_templates cmt
        WHERE cmt.tenant_id = ${request.tenantId}::uuid
          AND cmt.deleted_at IS NULL
          AND cmt.is_locked = true
          AND cmt.marketplace_key IS NOT NULL
          ${directionFilter}
          ${resourceTypeFilter}
          AND EXISTS (
            SELECT 1 FROM integrations i
            WHERE i.tenant_id = ${request.tenantId}::uuid
              AND i.marketplace_key = cmt.marketplace_key
              AND i.is_enabled = true
              AND i.deleted_at IS NULL
          )
        ORDER BY cmt.created_at ASC
      `
      const lockedTemplates = rawLocked.map(mapTemplateRowToCamel)

      return reply.send({ data: [...templates, ...lockedTemplates] })
    } catch (err) {
      request.log.error({ err }, 'csv-mappings list failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list mapping templates' } })
    }
  })

  // -------------------------------------------------------------------------
  // POST /csv-mappings — create a new template
  // -------------------------------------------------------------------------
  app.post('/csv-mappings', async (request, reply) => {
    const parsed = createMappingSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    }
    const { columnMappings, defaultValues, resourceType } = parsed.data
    const validationError = validateRequiredMappings(columnMappings, defaultValues, resourceType)
    if (validationError) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: validationError } })
    }

    try {
      // Creating a template implicitly guarantees a CSV integration exists for the tenant.
      await ensureCsvIntegration(request.db, request.tenantId)

      const template = await request.db.csvMappingTemplate.create({
        data: {
          tenantId: request.tenantId,
          name: parsed.data.name,
          direction: parsed.data.direction,
          resourceType,
          delimiter: parsed.data.delimiter,
          encoding: parsed.data.encoding,
          hasHeaderRow: parsed.data.hasHeaderRow,
          columnMappings: columnMappings as unknown as Prisma.InputJsonValue,
          defaultValues: defaultValues as unknown as Prisma.InputJsonObject,
          sampleData: parsed.data.sampleData
            ? (parsed.data.sampleData as unknown as Prisma.InputJsonObject)
            : Prisma.DbNull,
        },
      })
      return reply.code(201).send({ data: template })
    } catch (err) {
      request.log.error({ err }, 'csv-mappings create failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create mapping template' } })
    }
  })

  // -------------------------------------------------------------------------
  // GET /csv-mappings/:id — detail
  // -------------------------------------------------------------------------
  app.get('/csv-mappings/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template ID' } })
    }
    const template = await request.db.csvMappingTemplate.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
    })
    if (!template) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } })
    }
    const blocked = await ensureMarketplaceIntegrationEnabled(
      request.db,
      request.tenantId,
      template,
      reply,
    )
    if (blocked) return blocked
    return reply.send({ data: template })
  })

  // -------------------------------------------------------------------------
  // PATCH /csv-mappings/:id — update
  // -------------------------------------------------------------------------
  app.patch('/csv-mappings/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template ID' } })
    }
    const parsed = updateMappingSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } })
    }

    const existing = await request.db.csvMappingTemplate.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
    })
    if (!existing) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } })
    }
    if (existing.isLocked) {
      return reply.code(403).send({
        error: {
          code: 'TEMPLATE_LOCKED',
          message: 'This template belongs to a marketplace integration and cannot be modified.',
        },
      })
    }

    // When mappings or defaults are updated, re-validate against required fields.
    const nextMappings = (parsed.data.columnMappings ??
      (existing.columnMappings as unknown as ColumnMapping[])) as ColumnMapping[]
    const nextDefaults = (parsed.data.defaultValues ??
      (existing.defaultValues as Record<string, string>)) as Record<string, string>
    const nextResourceType = (parsed.data.resourceType ?? existing.resourceType) as
      | 'products'
      | 'stock'
      | 'locations'
    const validationError = validateRequiredMappings(nextMappings, nextDefaults, nextResourceType)
    if (validationError) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: validationError } })
    }

    try {
      const updated = await request.db.csvMappingTemplate.update({
        where: { id: params.data.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.direction !== undefined ? { direction: parsed.data.direction } : {}),
          ...(parsed.data.resourceType !== undefined
            ? { resourceType: parsed.data.resourceType }
            : {}),
          ...(parsed.data.delimiter !== undefined ? { delimiter: parsed.data.delimiter } : {}),
          ...(parsed.data.encoding !== undefined ? { encoding: parsed.data.encoding } : {}),
          ...(parsed.data.hasHeaderRow !== undefined
            ? { hasHeaderRow: parsed.data.hasHeaderRow }
            : {}),
          ...(parsed.data.columnMappings !== undefined
            ? { columnMappings: parsed.data.columnMappings as unknown as Prisma.InputJsonValue }
            : {}),
          ...(parsed.data.defaultValues !== undefined
            ? { defaultValues: parsed.data.defaultValues as unknown as Prisma.InputJsonObject }
            : {}),
          ...(parsed.data.sampleData !== undefined
            ? { sampleData: parsed.data.sampleData as unknown as Prisma.InputJsonObject }
            : {}),
        },
      })
      return reply.send({ data: updated })
    } catch (err) {
      request.log.error({ err }, 'csv-mappings update failed')
      return reply
        .code(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update mapping template' } })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /csv-mappings/:id — soft delete
  // -------------------------------------------------------------------------
  app.delete('/csv-mappings/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid template ID' } })
    }
    const existing = await request.db.csvMappingTemplate.findFirst({
      where: { id: params.data.id, tenantId: request.tenantId, deletedAt: null },
    })
    if (!existing) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } })
    }
    if (existing.isLocked) {
      return reply.code(403).send({
        error: {
          code: 'TEMPLATE_LOCKED',
          message: 'This template belongs to a marketplace integration and cannot be modified.',
        },
      })
    }
    await request.db.csvMappingTemplate.update({
      where: { id: params.data.id },
      data: { deletedAt: new Date() },
    })
    return reply.code(204).send()
  })

  // -------------------------------------------------------------------------
  // POST /csv-mappings/preview — parse headers + first 5 rows without saving
  // -------------------------------------------------------------------------
  app.post('/csv-mappings/preview', async (request, reply) => {
    try {
      const { file, fields } = await readMultipart(request)
      if (!file) {
        return reply
          .code(400)
          .send({ error: { code: 'VALIDATION_ERROR', message: 'Missing file part' } })
      }
      const delimiter = (fields['delimiter'] ?? ',').slice(0, 1) || ','
      const hasHeaderRow = (fields['hasHeaderRow'] ?? 'true') !== 'false'
      const encoding = (fields['encoding'] ?? 'utf-8').trim()
      const decodedBuffer = decodeBuffer(file.buffer, encoding)

      const { headers, rows } = await parseCsvStreaming(
        decodedBuffer,
        { delimiter, hasHeaderRow },
        CSV_PREVIEW_ROWS,
        'truncate',
      )
      return reply.send({
        data: {
          filename: file.filename,
          headers,
          sampleRows: rows,
        },
      })
    } catch (err) {
      return handleMultipartOrParseError(err, reply, request, 'preview')
    }
  })

  // -------------------------------------------------------------------------
  // POST /integrations/csv/import/products — bulk import
  // -------------------------------------------------------------------------
  app.post('/integrations/csv/import/products', async (request, reply) => {
    try {
      const { file, fields } = await readMultipart(request)
      if (!file) {
        return reply
          .code(400)
          .send({ error: { code: 'VALIDATION_ERROR', message: 'Missing file part' } })
      }

      const dryRun = fields['dryRun'] === 'true'
      const mappingTemplateIdRaw = fields['mappingTemplateId']
      const mappingTemplateId =
        mappingTemplateIdRaw && z.string().uuid().safeParse(mappingTemplateIdRaw).success
          ? mappingTemplateIdRaw
          : null

      // Load the template (and its mapping config) when one was passed.
      let mappings: ColumnMapping[] | null = null
      let defaults: Record<string, string> = {}
      let delimiter = ','
      let hasHeaderRow = true
      let encoding = (fields['encoding'] ?? 'utf-8').trim()
      // Non-null for locked marketplace templates → triggers per-batch
      // re-check during the import loop. Null for user-owned templates.
      let lockedTemplateIntegrationKey: string | null = null

      if (mappingTemplateId) {
        const template = await request.db.csvMappingTemplate.findFirst({
          where: { id: mappingTemplateId, tenantId: request.tenantId, deletedAt: null },
        })
        if (!template) {
          return reply
            .code(404)
            .send({ error: { code: 'NOT_FOUND', message: 'Mapping template not found' } })
        }
        if (template.direction !== 'import' || template.resourceType !== 'products') {
          return reply.code(400).send({
            error: {
              code: 'INVALID_TEMPLATE',
              message: 'Template must have direction=import and resourceType=products',
            },
          })
        }
        const blocked = await ensureMarketplaceIntegrationEnabled(
          request.db,
          request.tenantId,
          template,
          reply,
        )
        if (blocked) return blocked
        mappings = template.columnMappings as unknown as ColumnMapping[]
        defaults = template.defaultValues as Record<string, string>
        delimiter = template.delimiter
        hasHeaderRow = template.hasHeaderRow
        encoding = template.encoding
        if (template.isLocked && template.marketplaceKey) {
          lockedTemplateIntegrationKey = template.marketplaceKey
        }
      }

      const decodedBuffer = decodeBuffer(file.buffer, encoding)

      let parsed: { headers: string[]; rows: string[][] }
      try {
        parsed = await parseCsvStreaming(
          decodedBuffer,
          { delimiter, hasHeaderRow },
          CSV_MAX_ROWS,
          'strict',
        )
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code === 'ROW_LIMIT_EXCEEDED') {
          return reply.code(413).send({
            error: {
              code: 'FILE_TOO_LARGE',
              message: `CSV exceeds the maximum of ${String(CSV_MAX_ROWS)} rows`,
            },
          })
        }
        throw err
      }
      const { headers, rows } = parsed

      const extractor = buildExtractor(mappings, defaults)
      const result = {
        totalRows: rows.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as Array<{ row: number; sku?: string; reason: string }>,
        dryRun,
      }

      for (let i = 0; i < rows.length; i++) {
        // TOCTOU guard: for locked marketplace templates, periodically
        // re-verify the source integration is still enabled. Aborts the
        // import (rather than silently continuing) if it was disabled or
        // uninstalled mid-run.
        if (
          lockedTemplateIntegrationKey !== null &&
          i > 0 &&
          i % INTEGRATION_RECHECK_INTERVAL === 0
        ) {
          const stillEnabled = await request.db.integration.findFirst({
            where: {
              tenantId: request.tenantId,
              marketplaceKey: lockedTemplateIntegrationKey,
              isEnabled: true,
              deletedAt: null,
            },
            select: { id: true },
          })
          if (!stillEnabled) {
            result.errors.push({
              row: i + 1,
              reason: 'Import aborted: the integration providing this template was disabled.',
            })
            break
          }
        }

        const rowNumber = i + 1 // 1-indexed from first data row
        const rawRow = rows[i]
        if (!rawRow) continue
        try {
          const recordObj: Record<string, string | undefined> = {}
          headers.forEach((h, idx) => {
            recordObj[h] = rawRow[idx]
          })

          const extracted = extractor(recordObj)
          const name = extracted.name
          const sku = extracted.sku

          if (!name) {
            result.errors.push({
              row: rowNumber,
              ...(sku ? { sku } : {}),
              reason: 'Missing required field: name',
            })
            continue
          }
          if (!sku) {
            result.errors.push({ row: rowNumber, reason: 'Missing required field: sku' })
            continue
          }

          if (dryRun) {
            // In dryRun mode we don't issue writes; we still count what would
            // have happened so the UI can show a plausible report.
            const matched = await findExistingProduct(request.db, request.tenantId, {
              sku,
              ...(extracted.barcode ? { barcode: extracted.barcode } : {}),
            })
            if (matched) result.updated += 1
            else result.created += 1
            continue
          }

          const outcome = await upsertProductFromRow(request.db, request.tenantId, {
            name,
            sku,
            ...(extracted.barcode ? { barcode: extracted.barcode } : {}),
            ...(extracted.description ? { description: extracted.description } : {}),
            ...(extracted.category ? { category: extracted.category } : {}),
            ...(extracted.unit ? { unit: extracted.unit } : {}),
            ...(extracted.batchTracking ? { batchTracking: extracted.batchTracking } : {}),
          })
          result[outcome] += 1
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unknown error'
          const rowRef = rows[i]
          const sku = rowRef ? extractSkuFallback(headers, rowRef) : undefined
          result.errors.push({
            row: rowNumber,
            ...(sku ? { sku } : {}),
            reason,
          })
        }
      }

      if (!dryRun) {
        await recordImportIncident(request, result)
      }

      return reply.send({ data: result })
    } catch (err) {
      return handleMultipartOrParseError(err, reply, request, 'import')
    }
  })
}

// ---------------------------------------------------------------------------
// Domain helpers (kept below so the handler block reads top-down)
// ---------------------------------------------------------------------------

async function findExistingProduct(
  db: PrismaClient,
  tenantId: string,
  keys: { barcode?: string; sku: string },
): Promise<{ productId: string } | null> {
  if (keys.barcode) {
    const viaBarcode = await db.productVariant.findFirst({
      where: { tenantId, barcode: keys.barcode, deletedAt: null },
      select: { productId: true },
    })
    if (viaBarcode) return { productId: viaBarcode.productId }
  }
  const viaSku = await db.productVariant.findFirst({
    where: { tenantId, sku: keys.sku, deletedAt: null },
    select: { productId: true },
  })
  if (viaSku) return { productId: viaSku.productId }
  return null
}

async function upsertProductFromRow(
  db: PrismaClient,
  tenantId: string,
  row: {
    name: string
    sku: string
    barcode?: string
    description?: string
    category?: string
    unit?: string
    batchTracking?: string
  },
): Promise<'created' | 'updated' | 'skipped'> {
  const existing = await findExistingProduct(db, tenantId, {
    sku: row.sku,
    ...(row.barcode ? { barcode: row.barcode } : {}),
  })
  const batchTrackingParsed = parseBatchTracking(row.batchTracking)
  if (!existing) {
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          name: row.name,
          description: row.description ?? null,
          category: row.category ?? null,
          unit: row.unit ?? 'piece',
          batchTracking: batchTrackingParsed ?? false,
          metadata: { source: 'csv' } as Prisma.InputJsonObject,
        },
      })
      await tx.productVariant.create({
        data: {
          tenantId,
          productId: product.id,
          sku: row.sku,
          barcode: row.barcode ?? null,
          name: null,
          attributes: {} as Prisma.InputJsonObject,
          isActive: true,
        },
      })
    })
    return 'created'
  }

  // Update path — only overwrite fields where the CSV provided a non-empty value.
  const current = await db.product.findUnique({
    where: { id: existing.productId },
    select: {
      name: true,
      description: true,
      category: true,
      unit: true,
      batchTracking: true,
      metadata: true,
    },
  })
  if (!current) return 'skipped'

  const updates: Prisma.ProductUpdateInput = {}
  if (row.name && row.name !== current.name) updates.name = row.name
  if (row.description && row.description !== current.description) updates.description = row.description
  if (row.category && row.category !== current.category) updates.category = row.category
  if (row.unit && row.unit !== current.unit) updates.unit = row.unit
  if (batchTrackingParsed !== undefined && batchTrackingParsed !== current.batchTracking) {
    updates.batchTracking = batchTrackingParsed
  }

  const currentMeta = (current.metadata ?? {}) as Record<string, unknown>
  const needsSourceStamp = currentMeta['source'] !== 'csv'
  if (needsSourceStamp) {
    updates.metadata = {
      ...currentMeta,
      source: 'csv',
    } as Prisma.InputJsonObject
  }

  if (Object.keys(updates).length === 0) return 'skipped'

  await db.product.update({ where: { id: existing.productId }, data: updates })
  return 'updated'
}

function extractSkuFallback(headers: string[], row: string[]): string | undefined {
  const idx = headers.findIndex((h) => h.toLowerCase() === 'sku')
  if (idx >= 0) return row[idx]
  return undefined
}

async function recordImportIncident(
  request: FastifyRequest,
  result: {
    totalRows: number
    created: number
    updated: number
    skipped: number
    errors: Array<{ row: number; sku?: string; reason: string }>
  },
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const integration = await ensureCsvIntegration(request.db, request.tenantId)
  const hasErrors = result.errors.length > 0
  const userMessage = hasErrors
    ? `Import abgeschlossen mit ${String(result.errors.length)} Fehlern. Bitte Fehlerbericht prüfen.`
    : `Import erfolgreich: ${String(result.created)} Produkte angelegt, ${String(result.updated)} aktualisiert.`

  const { error } = await supabase.from('incidents').insert({
    tenant_id: request.tenantId,
    source_type: 'api',
    source_id: 'POST /integrations/csv/import/products',
    integration_id: integration.id,
    severity: hasErrors ? 'warning' : 'info',
    code: 'CSV_PRODUCT_IMPORT_COMPLETE',
    title: `CSV import: ${String(result.created)} created, ${String(result.updated)} updated, ${String(result.errors.length)} errors`,
    user_message: userMessage,
    is_user_visible: true,
    context: {
      totalRows: result.totalRows,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    },
  })

  if (error) {
    // Incident write failures must not fail the import itself — log and continue.
    request.log.error({ err: error }, 'csv import: failed to write incident')
  }
}

function handleMultipartOrParseError(
  err: unknown,
  reply: FastifyReply,
  request: FastifyRequest,
  op: 'preview' | 'import',
): FastifyReply | Promise<FastifyReply> {
  if (err instanceof MultipartUserError) {
    return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } })
  }
  // @fastify/multipart throws with code 'FST_REQ_FILE_TOO_LARGE' / 'FST_FILES_LIMIT' etc.
  const asObj = err as { code?: string; message?: string }
  if (asObj.code === 'FST_REQ_FILE_TOO_LARGE' || asObj.code === 'FST_FILES_LIMIT') {
    return reply.code(413).send({
      error: { code: 'FILE_TOO_LARGE', message: asObj.message ?? 'CSV file exceeds the 5 MB limit' },
    })
  }
  if (asObj.code?.startsWith('CSV_')) {
    // csv-parse errors (e.g. "Invalid Record Length")
    return reply
      .code(400)
      .send({ error: { code: 'VALIDATION_ERROR', message: asObj.message ?? 'CSV parse error' } })
  }
  request.log.error({ err }, `csv ${op} failed`)
  return reply
    .code(500)
    .send({ error: { code: 'INTERNAL_ERROR', message: 'CSV processing failed' } })
}
