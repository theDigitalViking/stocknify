import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { Prisma, type CsvMappingTemplate, type PrismaClient } from '@prisma/client'
import { parse as csvParseStream } from 'csv-parse'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import iconv from 'iconv-lite'
import { z } from 'zod'

import { cleanupOrphanedStockTypeDefinitions } from '../../lib/stock-utils.js'
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

// Stock import field dictionary. `sku` and `barcode` are each individually
// optional, but the handler enforces that at least one of them is mapped or
// has a default value — a row without either cannot resolve to a variant.
const STOCK_IMPORT_FIELDS = [
  { key: 'sku', label: 'SKU', required: false },
  { key: 'barcode', label: 'EAN / Barcode', required: false },
  { key: 'locationName', label: 'Location', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'stockType', label: 'Stock type', required: false }, // default: 'available'
  { key: 'batchNumber', label: 'Batch number', required: false },
  { key: 'expiryDate', label: 'Expiry date (ISO)', required: false },
  { key: 'storageLocation', label: 'Storage location', required: false },
] as const

type StockImportField = (typeof STOCK_IMPORT_FIELDS)[number]['key']

function isStockImportField(value: string): value is StockImportField {
  return STOCK_IMPORT_FIELDS.some((f) => f.key === value)
}

// Default header names for stock import when no mapping template is selected.
// Both snake_case and camelCase variants are accepted so we tolerate headers
// emitted by a wide range of systems (ERP exports, spreadsheets, etc.).
const DEFAULT_STOCK_HEADERS: Record<string, StockImportField> = {
  sku: 'sku',
  barcode: 'barcode',
  location: 'locationName',
  locationName: 'locationName',
  quantity: 'quantity',
  stockType: 'stockType',
  stock_type: 'stockType',
  batchNumber: 'batchNumber',
  batch_number: 'batchNumber',
  expiryDate: 'expiryDate',
  expiry_date: 'expiryDate',
  storageLocation: 'storageLocation',
  storage_location: 'storageLocation',
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
  const fields =
    resourceType === 'products'
      ? PRODUCT_IMPORT_FIELDS
      : resourceType === 'stock'
        ? STOCK_IMPORT_FIELDS
        : null

  if (!fields) {
    // locations mapping validation is deferred to a later phase.
    return null
  }

  for (const spec of fields) {
    if (!spec.required) continue
    const mapping = mappings.find((m) => m.field === spec.key)
    const hasColumn = Boolean(mapping?.csvColumn)
    const hasDefault = Boolean(mapping?.defaultValue) || Boolean(defaults[spec.key])
    if (!hasColumn && !hasDefault) {
      return `Required field "${spec.label}" must be mapped to a CSV column or given a default value`
    }
  }

  // Stock rows need at least one identifier (sku or barcode) to resolve a
  // variant. Neither is marked `required` individually, so check the
  // disjunction explicitly here.
  if (resourceType === 'stock') {
    const hasSku =
      mappings.some((m) => m.field === 'sku' && Boolean(m.csvColumn)) || Boolean(defaults['sku'])
    const hasBarcode =
      mappings.some((m) => m.field === 'barcode' && Boolean(m.csvColumn)) ||
      Boolean(defaults['barcode'])
    if (!hasSku && !hasBarcode) {
      return 'At least one of SKU or EAN/Barcode must be mapped to a CSV column or given a default value'
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

// Flatten a thrown value into a user-facing message, including one level of
// `cause` when present. The row-level error path records only this string in
// the import result, so preserving the cause chain here is the difference
// between an actionable incident and a generic "something went wrong".
function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  return err.cause instanceof Error
    ? `${err.message} (caused by: ${err.cause.message})`
    : err.message
}

// Unique-violation detection across both ORM and raw SQL paths.
//   P2002 — Prisma Client ORM unique violation (create/update via prisma.*).
//   P2010 — raw query error; unique violations surface as SQLSTATE 23505
//           on `err.meta.code`. `tx.$executeRaw` goes through this path.
// Any other error shape is treated as non-unique so the caller aborts the
// transaction correctly.
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (err.code === 'P2002') return true
  if (err.code === 'P2010') {
    const rawCode = err.meta?.['code']
    return typeof rawCode === 'string' && rawCode === '23505'
  }
  return false
}

// Parallel to buildExtractor but scoped to the stock field dictionary.
type StockRowExtractor = (
  row: Record<string, string | undefined>,
) => Partial<Record<StockImportField, string>>

function buildStockExtractor(
  mappings: ColumnMapping[] | null,
  defaults: Record<string, string>,
): StockRowExtractor {
  if (!mappings) {
    return (row) => {
      const out: Partial<Record<StockImportField, string>> = {}
      for (const [header, field] of Object.entries(DEFAULT_STOCK_HEADERS)) {
        const value = row[header]?.trim()
        if (value) out[field] = value
      }
      return out
    }
  }
  return (row) => {
    const out: Partial<Record<StockImportField, string>> = {}
    for (const m of mappings) {
      if (!isStockImportField(m.field)) continue
      const raw = m.csvColumn ? row[m.csvColumn]?.trim() : undefined
      const fallback = m.defaultValue?.trim() || defaults[m.field]?.trim()
      const value = raw || fallback
      if (value) out[m.field] = value
    }
    for (const [field, value] of Object.entries(defaults)) {
      if (!isStockImportField(field)) continue
      if (out[field]) continue
      const trimmed = value.trim()
      if (trimmed) out[field] = trimmed
    }
    return out
  }
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
          request.log.error({ err, row: rowNumber }, 'csv import: row failed')
          const reason = extractErrorMessage(err)
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

  // -------------------------------------------------------------------------
  // POST /integrations/csv/import/stock — bulk stock-level import
  //
  // Upserts stock_levels by (tenant, variant, location, storageLocation,
  // batch, stockType). Every change is mirrored into stock_movements so the
  // audit trail is intact. Variants are resolved via barcode (preferred) or
  // SKU; locations via exact name match; optional bins and batches via name
  // scoped to the resolved location / product.
  // -------------------------------------------------------------------------
  app.post('/integrations/csv/import/stock', async (request, reply) => {
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

      let mappings: ColumnMapping[] | null = null
      let defaults: Record<string, string> = {}
      let delimiter = ','
      let hasHeaderRow = true
      let encoding = (fields['encoding'] ?? 'utf-8').trim()
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
        if (template.direction !== 'import' || template.resourceType !== 'stock') {
          return reply.code(400).send({
            error: {
              code: 'INVALID_TEMPLATE',
              message: 'Template must have direction=import and resourceType=stock',
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

      const extractor = buildStockExtractor(mappings, defaults)
      const result = {
        totalRows: rows.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [] as Array<{ row: number; sku?: string; reason: string }>,
        dryRun,
      }

      for (let i = 0; i < rows.length; i++) {
        // Same TOCTOU guard as the products import — re-verify the locked
        // template's integration is still enabled periodically.
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

        const rowNumber = i + 1
        const rawRow = rows[i]
        if (!rawRow) continue

        try {
          const recordObj: Record<string, string | undefined> = {}
          headers.forEach((h, idx) => {
            recordObj[h] = rawRow[idx]
          })

          const extracted = extractor(recordObj)

          const variant = await resolveVariant(request.db, request.tenantId, extracted)
          if (!variant) {
            result.errors.push({
              row: rowNumber,
              ...(extracted.sku ? { sku: extracted.sku } : {}),
              reason: 'Product variant not found — no match for SKU or barcode',
            })
            continue
          }

          const locationName = extracted.locationName?.trim()
          if (!locationName) {
            result.errors.push({
              row: rowNumber,
              sku: variant.sku,
              reason: 'Missing required field: locationName',
            })
            continue
          }
          let location = await request.db.location.findFirst({
            where: { tenantId: request.tenantId, name: locationName, deletedAt: null },
            select: { id: true },
          })
          if (!location && !dryRun) {
            // Auto-create a missing location instead of failing the row.
            // 'own_warehouse' is the sensible default for locations a merchant
            // types into a CSV — the "I know this place exists, just wasn't
            // set up yet" case. A fulfiller integration would create its own
            // location separately.
            location = await request.db.location.create({
              data: {
                tenantId: request.tenantId,
                name: locationName,
                type: 'own_warehouse',
                address: {},
              },
              select: { id: true },
            })
          }
          if (!location) {
            // Dry-run with a missing location: report as skipped rather than
            // as an error — the real run would create it and succeed.
            result.skipped += 1
            continue
          }

          const quantityRaw = extracted.quantity?.trim()
          if (!quantityRaw) {
            result.errors.push({
              row: rowNumber,
              sku: variant.sku,
              reason: 'Missing required field: quantity',
            })
            continue
          }
          // Accept comma decimals (de-DE) — Number() doesn't do the swap.
          const quantity = Number(quantityRaw.replace(',', '.'))
          if (isNaN(quantity)) {
            result.errors.push({
              row: rowNumber,
              sku: variant.sku,
              reason: `Invalid quantity: "${quantityRaw}"`,
            })
            continue
          }

          const stockType = extracted.stockType?.trim() || 'available'

          // Ensure a StockTypeDefinition exists for this key. Auto-register
          // on first sight so the tenant's `/stock-types` list is accurate
          // without seed SQL and stays accurate when integrations or CSVs
          // surface new type keys.
          //
          // Concurrency: `findFirst`-then-`create` is racy — two parallel
          // imports observing no existing row both try to INSERT and one
          // loses with a unique violation. That would land in the per-row
          // catch and skip the actual stock write. We use the insert-then-
          // catch-P2010/23505 savepoint pattern from CODING_GUIDELINES 3b/3c
          // so the race collapses into the expected "already exists" branch.
          if (!dryRun) {
            // Prefer an existing system default (tenantId = null) over
            // creating a tenant-owned row. Without this check, every import
            // that surfaces a standard key like 'available' or 'reserved'
            // would append a duplicate tenant-scoped definition alongside
            // the system row — the UNIQUE(tenant_id, key) constraint allows
            // it because NULL tenant_id is a distinct bucket.
            const systemRow = await request.db.stockTypeDefinition.findFirst({
              where: { key: stockType, tenantId: null },
              select: { id: true },
            })
            if (!systemRow) {
              // 'in_transit' → 'In Transit'. Users can rename it later; the
              // label is only for display and the key is immutable.
              const label = stockType
                .split('_')
                .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
                .join(' ')
              await request.db.$transaction(async (tx) => {
                await tx.$executeRaw`SAVEPOINT stock_type_upsert`
                try {
                  await tx.$executeRaw`
                    INSERT INTO stock_type_definitions (
                      id, tenant_id, key, label, is_system, sort_order, created_at, updated_at
                    ) VALUES (
                      gen_random_uuid(),
                      ${request.tenantId}::uuid,
                      ${stockType},
                      ${label},
                      false,
                      99,
                      now(),
                      now()
                    )
                  `
                  await tx.$executeRaw`RELEASE SAVEPOINT stock_type_upsert`
                } catch (insertErr) {
                  try {
                    await tx.$executeRaw`ROLLBACK TO SAVEPOINT stock_type_upsert`
                    await tx.$executeRaw`RELEASE SAVEPOINT stock_type_upsert`
                  } catch (cleanupErr) {
                    // Stable user-facing message; both errors travel in the
                    // AggregateError's `errors` array so server-side logs
                    // (pino err serializer) capture the full chain without
                    // leaking driver/SQL details into result.errors[].reason.
                    throw new AggregateError(
                      [cleanupErr, insertErr],
                      'Savepoint cleanup failed during stock-type upsert',
                    )
                  }
                  if (!isUniqueViolation(insertErr)) throw insertErr
                  // Unique violation: a concurrent import just created the
                  // tenant-scoped definition. Proceed to the stock write.
                }
              })
            }
          }

          // Storage location (bin) auto-create: symmetric to the parent
          // Location auto-create above. Mistyped bin names previously ended
          // up as silent null fallbacks; the previous strict-match version
          // failed the whole row. Auto-creating is consistent with "CSV is
          // authoritative for shapes the tenant will adopt" — the merchant
          // can rename or retype later via the locations UI.
          let storageLocationId: string | null = null
          if (extracted.storageLocation?.trim()) {
            const storageName = extracted.storageLocation.trim()
            let storageLocation = await request.db.storageLocation.findFirst({
              where: {
                tenantId: request.tenantId,
                locationId: location.id,
                name: storageName,
                deletedAt: null,
              },
              select: { id: true },
            })
            if (!storageLocation && !dryRun) {
              storageLocation = await request.db.storageLocation.create({
                data: {
                  tenantId: request.tenantId,
                  locationId: location.id,
                  name: storageName,
                  type: 'bin',
                  trackInventory: true,
                  metadata: {},
                },
                select: { id: true },
              })
            }
            if (storageLocation) {
              storageLocationId = storageLocation.id
            }
            // Dry-run with missing bin: storageLocationId stays null — the
            // import target will be the bin-agnostic bucket for preview. A
            // real run would create the bin; the preview counts reflect that
            // outcome loosely. No row error emitted.
          }

          // Batch lookup/create: only when the product has batchTracking on.
          // Products without batch tracking silently drop the batch_number
          // and expiry columns — those rows become the batch-agnostic stock
          // record for the product.
          let batchId: string | null = null
          if (extracted.batchNumber?.trim()) {
            const batchNumber = extracted.batchNumber.trim()
            const product = await request.db.product.findFirst({
              where: { id: variant.productId, tenantId: request.tenantId },
              select: { id: true, batchTracking: true },
            })
            if (product?.batchTracking) {
              let batch = await request.db.batch.findFirst({
                where: { tenantId: request.tenantId, productId: product.id, batchNumber },
              })
              if (!batch && !dryRun) {
                const rawExpiry = extracted.expiryDate?.trim()
                const parsedExpiry = rawExpiry ? new Date(rawExpiry) : null
                batch = await request.db.batch.create({
                  data: {
                    tenantId: request.tenantId,
                    productId: product.id,
                    batchNumber,
                    expiryDate:
                      parsedExpiry && !isNaN(parsedExpiry.getTime()) ? parsedExpiry : null,
                    metadata: {},
                  },
                })
              }
              if (batch) batchId = batch.id
            }
          }

          if (dryRun) {
            // Pass nullable foreign keys as `null` (not undefined) so Prisma
            // filters `IS NULL` instead of ignoring the column. Otherwise a
            // row with no bin/batch would match any existing stock_level with
            // any bin/batch and miscount as "updated".
            const existing = await request.db.stockLevel.findFirst({
              where: {
                tenantId: request.tenantId,
                variantId: variant.id,
                locationId: location.id,
                storageLocationId,
                batchId,
                stockType,
              },
            })
            if (existing) result.updated += 1
            else result.created += 1
            continue
          }

          const outcome = await upsertStockLevel(request.db, request.tenantId, {
            variantId: variant.id,
            locationId: location.id,
            storageLocationId,
            batchId,
            stockType,
            quantity,
            source: 'csv',
            createdBy: request.userId,
          })
          result[outcome] += 1
        } catch (err) {
          request.log.error({ err, row: rowNumber }, 'csv stock import: row failed')
          const reason = extractErrorMessage(err)
          const rowRef = rows[i]
          const sku = rowRef ? extractSkuFallback(headers, rowRef) : undefined
          result.errors.push({ row: rowNumber, ...(sku ? { sku } : {}), reason })
        }
      }

      if (!dryRun) {
        // A stock type key that was auto-registered on first sight may have
        // later been removed by a subsequent import (e.g. empty rows rolled
        // the only usage out). Sweep orphans before writing the incident so
        // the post-import state in stock_type_definitions is consistent.
        await cleanupOrphanedStockTypeDefinitions(request.db, request.tenantId)
        await recordStockImportIncident(request, result)
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

// ---------------------------------------------------------------------------
// Stock import helpers
// ---------------------------------------------------------------------------

// Resolve a variant by barcode first (preferred — globally unique) then fall
// back to SKU. Both are tenant-scoped and skip soft-deleted variants.
async function resolveVariant(
  db: PrismaClient,
  tenantId: string,
  extracted: Partial<Record<StockImportField, string>>,
): Promise<{ id: string; sku: string; productId: string } | null> {
  const sku = extracted.sku?.trim()
  const barcode = extracted.barcode?.trim()

  if (barcode) {
    const v = await db.productVariant.findFirst({
      where: { tenantId, barcode, deletedAt: null },
      select: { id: true, sku: true, productId: true },
    })
    if (v) return v
  }
  if (sku) {
    const v = await db.productVariant.findFirst({
      where: { tenantId, sku, deletedAt: null },
      select: { id: true, sku: true, productId: true },
    })
    if (v) return v
  }
  return null
}

// Upsert a stock level row and append a matching stock_movement record.
// Returns 'created', 'updated', or 'skipped' (no-op when quantity is
// unchanged).
//
// All writes share a single interactive transaction. A PostgreSQL SAVEPOINT
// wraps the INSERT attempt so a P2002 (unique-constraint violation) can be
// rolled back locally without aborting the outer transaction — continuing
// after a raw statement error without a savepoint would hit
// "current transaction is aborted, commands ignored until end of transaction
// block" on the next statement.
//
// Race shape: Postgres does not take a gap lock under READ COMMITTED, so two
// concurrent imports for a tuple that has no existing stock row would both
// see no row and both try to INSERT. One wins; the loser's INSERT raises
// P2002 against the COALESCE-based unique index (see
// apps/api/src/db/sql/unique-stock-levels.sql). The savepoint lets the loser
// continue on the update path with the row the winner just created.
//
// `IS NOT DISTINCT FROM` on the nullable FKs matches the same NULL-equality
// semantics the COALESCE-based partial unique index uses.
async function upsertStockLevel(
  db: PrismaClient,
  tenantId: string,
  row: {
    variantId: string
    locationId: string
    storageLocationId: string | null
    batchId: string | null
    stockType: string
    quantity: number
    source: string
    createdBy: string | null
  },
): Promise<'created' | 'updated' | 'skipped'> {
  const newQty = new Prisma.Decimal(row.quantity)
  const now = new Date()

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SAVEPOINT upsert_stock_level`

    let wasInserted = false
    try {
      await tx.$executeRaw`
        INSERT INTO stock_levels (
          id, tenant_id, variant_id, location_id,
          storage_location_id, batch_id,
          stock_type, quantity, source, last_synced_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${tenantId}::uuid,
          ${row.variantId}::uuid,
          ${row.locationId}::uuid,
          ${row.storageLocationId}::uuid,
          ${row.batchId}::uuid,
          ${row.stockType},
          ${newQty},
          ${row.source},
          ${now},
          ${now},
          ${now}
        )
      `
      await tx.$executeRaw`RELEASE SAVEPOINT upsert_stock_level`
      wasInserted = true
    } catch (insertErr) {
      // Any INSERT error — unique or not — leaves the transaction in the
      // aborted state until `ROLLBACK TO SAVEPOINT` restores it. Doing a
      // bare `RELEASE SAVEPOINT` while aborted would itself fail and mask
      // the original error. Always ROLLBACK first, then RELEASE.
      //
      // Cleanup itself runs in a nested try/catch so a ROLLBACK/RELEASE
      // failure (e.g. connection interruption) does not shadow the original
      // insertErr. If cleanup fails we rethrow a wrapped error that carries
      // the original as `cause` — observability over brevity. Per coding
      // guideline 3d.
      try {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT upsert_stock_level`
        await tx.$executeRaw`RELEASE SAVEPOINT upsert_stock_level`
      } catch (cleanupErr) {
        // cleanupErr is the primary signal — it tells ops WHAT broke during
        // the rollback (connection loss, protocol state drift, etc.).
        // insertErr is preserved as a peer so the chain still reveals WHY
        // cleanup was attempted. AggregateError keeps `.message` stable so
        // result.errors[].reason does not leak driver/SQL details; the full
        // chain reaches server-side logs via pino's err serializer.
        throw new AggregateError(
          [cleanupErr, insertErr],
          'Savepoint cleanup failed during stock import',
        )
      }
      if (!isUniqueViolation(insertErr)) {
        // Unknown error: outer transaction aborts so neither the would-be
        // stock-level row nor the would-be movement row land.
        throw insertErr
      }
      // Unique violation: fall through to the update path below — the row
      // must exist (either pre-existing or created by a concurrent writer).
    }

    if (wasInserted) {
      await tx.stockMovement.create({
        data: {
          tenantId,
          variantId: row.variantId,
          locationId: row.locationId,
          storageLocationId: row.storageLocationId,
          batchId: row.batchId,
          stockType: row.stockType,
          quantityBefore: new Prisma.Decimal(0),
          quantityAfter: newQty,
          delta: newQty,
          movementType: 'sync',
          source: row.source,
          createdBy: row.createdBy,
        },
      })
      return 'created'
    }

    // Row exists (either pre-existing or just created by a concurrent
    // transaction). SELECT FOR UPDATE locks it so the movement row we emit
    // below reflects the quantity we actually wrote against.
    const existingRows = await tx.$queryRaw<Array<{ id: string; quantity: string }>>`
      SELECT id, quantity::text
      FROM stock_levels
      WHERE tenant_id    = ${tenantId}::uuid
        AND variant_id   = ${row.variantId}::uuid
        AND location_id  = ${row.locationId}::uuid
        AND storage_location_id IS NOT DISTINCT FROM ${row.storageLocationId}::uuid
        AND batch_id     IS NOT DISTINCT FROM ${row.batchId}::uuid
        AND stock_type   = ${row.stockType}
      FOR UPDATE
    `
    const existing = existingRows[0]
    if (!existing) {
      // Invariant violation: a P2002 was just raised for this tuple, so the
      // row must exist. Throwing surfaces this through the per-row error
      // path rather than silently miscounting as 'skipped'.
      throw new Error(
        `Stock level invariant violated: P2002 was thrown but row not found for ` +
          `variant=${row.variantId} location=${row.locationId} stockType=${row.stockType}`,
      )
    }

    const currentQty = new Prisma.Decimal(existing.quantity)
    if (currentQty.equals(newQty)) return 'skipped'

    const delta = newQty.minus(currentQty)

    await tx.stockLevel.update({
      where: { id: existing.id },
      data: { quantity: newQty, source: row.source, lastSyncedAt: now },
    })
    await tx.stockMovement.create({
      data: {
        tenantId,
        variantId: row.variantId,
        locationId: row.locationId,
        storageLocationId: row.storageLocationId,
        batchId: row.batchId,
        stockType: row.stockType,
        quantityBefore: currentQty,
        quantityAfter: newQty,
        delta,
        movementType: 'sync',
        source: row.source,
        createdBy: row.createdBy,
      },
    })
    return 'updated'
  })
}

async function recordStockImportIncident(
  request: FastifyRequest,
  result: {
    totalRows: number
    created: number
    updated: number
    skipped: number
    errors: Array<{ row: number; sku?: string; reason: string }>
    dryRun: boolean
  },
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const integration = await ensureCsvIntegration(request.db, request.tenantId)
  const hasErrors = result.errors.length > 0
  const userMessage = hasErrors
    ? `Bestandsimport abgeschlossen mit ${String(result.errors.length)} Fehlern. Bitte Fehlerbericht prüfen.`
    : `Bestandsimport erfolgreich: ${String(result.created)} angelegt, ${String(result.updated)} aktualisiert.`

  const { error } = await supabase.from('incidents').insert({
    tenant_id: request.tenantId,
    source_type: 'api',
    source_id: 'POST /integrations/csv/import/stock',
    integration_id: integration.id,
    severity: hasErrors ? 'warning' : 'info',
    code: 'CSV_STOCK_IMPORT_COMPLETE',
    title: `CSV stock import: ${String(result.created)} created, ${String(result.updated)} updated, ${String(result.errors.length)} errors`,
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
    request.log.error({ err: error }, 'csv stock import: failed to write incident')
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
