import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

import { Prisma, type PrismaClient } from '@prisma/client'
import { parse as csvParseStream } from 'csv-parse'
import type { FastifyBaseLogger } from 'fastify'
import iconv from 'iconv-lite'

import { InvalidDateError, sanitizeRowError } from '../../lib/csv-errors.js'
import { isUniqueViolation } from '../../lib/db-errors.js'
import { upsertStockLevel } from '../stock/upsert-stock-level.js'

// ---------------------------------------------------------------------------
// Stock import field dictionary (mirrors the one in routes/csv/index.ts).
// Kept here so the SFTP/FTP import pipeline can run without depending on the
// CSV multipart route module. The default-header table is identical.
// ---------------------------------------------------------------------------

export const STOCK_IMPORT_FIELDS = [
  { key: 'sku', label: 'SKU', required: false },
  { key: 'barcode', label: 'EAN / Barcode', required: false },
  { key: 'locationName', label: 'Location', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'stockType', label: 'Stock type', required: false },
  { key: 'batchNumber', label: 'Batch number', required: false },
  { key: 'expiryDate', label: 'Expiry date (ISO)', required: false },
  { key: 'storageLocation', label: 'Storage location', required: false },
] as const

export type StockImportField = (typeof STOCK_IMPORT_FIELDS)[number]['key']

export function isStockImportField(value: string): value is StockImportField {
  return STOCK_IMPORT_FIELDS.some((f) => f.key === value)
}

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

const SUPPORTED_ENCODINGS = new Set(['utf-8', 'utf8', 'iso-8859-1', 'latin1', 'windows-1252'])

export interface ColumnMapping {
  csvColumn: string | null
  field: string
  required: boolean
  defaultValue?: string
}

export type StockRowExtractor = (
  row: Record<string, string | undefined>,
) => Partial<Record<StockImportField, string>>

export function buildStockExtractor(
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

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

export interface ParseCsvOptions {
  delimiter: string
  hasHeaderRow: boolean
}

// Decode a file buffer to a UTF-8 string using the given encoding label,
// then re-encode as a UTF-8 Buffer. Falls back to utf-8 for any unrecognised
// encoding string. Mirrors the helper in routes/csv/index.ts.
export function decodeBuffer(buffer: Buffer, encoding: string): Buffer {
  const enc = encoding.toLowerCase().trim()
  if (!SUPPORTED_ENCODINGS.has(enc) || enc === 'utf-8' || enc === 'utf8') {
    return buffer
  }
  const decoded = iconv.decode(buffer, enc)
  return Buffer.from(decoded, 'utf-8')
}

export async function parseCsvStreamingBuffer(
  buffer: Buffer,
  opts: ParseCsvOptions,
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

// ---------------------------------------------------------------------------
// Per-row stock import core — shared between CSV multipart upload and
// SFTP/FTP-streamed imports. Caller supplies the parsed headers/rows + an
// extractor; this function runs the same resolve-variant → resolve-location
// → upsert pipeline that lived inline in routes/csv/index.ts before
// Cycle 3-C.
// ---------------------------------------------------------------------------

export interface StockImportResult {
  totalRows: number
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; sku?: string; reason: string }>
  dryRun: boolean
}

export interface StockImportRowsContext {
  db: PrismaClient
  tenantId: string
  userId: string | null
  source: string // 'csv' | 'sftp' | 'ftp' — passed through to upsertStockLevel
  dryRun: boolean
  log: FastifyBaseLogger
  // Optional TOCTOU guard for locked-marketplace-template imports. Returns
  // false to abort the loop. Skipped when omitted.
  recheckIntegration?: () => Promise<boolean>
  recheckInterval?: number
}

export async function processStockImportRows(
  ctx: StockImportRowsContext,
  parsed: { headers: string[]; rows: string[][] },
  extractor: StockRowExtractor,
): Promise<StockImportResult> {
  const { db, tenantId, userId, source, dryRun, log } = ctx
  const { headers, rows } = parsed
  const recheckInterval = ctx.recheckInterval ?? 10
  const result: StockImportResult = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    dryRun,
  }

  for (let i = 0; i < rows.length; i++) {
    if (
      ctx.recheckIntegration !== undefined &&
      i > 0 &&
      i % recheckInterval === 0
    ) {
      const stillEnabled = await ctx.recheckIntegration()
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

      const variant = await resolveVariant(db, tenantId, extracted)
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
      let location = await db.location.findFirst({
        where: { tenantId, name: locationName, deletedAt: null },
        select: { id: true },
      })
      if (!location && !dryRun) {
        location = await db.location.create({
          data: {
            tenantId,
            name: locationName,
            type: 'own_warehouse',
            address: {},
          },
          select: { id: true },
        })
      }
      if (!location) {
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
      const quantity = Number(quantityRaw.replace(',', '.'))
      if (isNaN(quantity)) {
        result.errors.push({
          row: rowNumber,
          sku: variant.sku,
          reason: `Invalid number for field "quantity": "${quantityRaw}"`,
        })
        continue
      }

      const stockType = extracted.stockType?.trim() || 'available'

      if (!dryRun) {
        const systemRow = await db.stockTypeDefinition.findFirst({
          where: { key: stockType, tenantId: null },
          select: { id: true },
        })
        if (!systemRow) {
          const label = stockType
            .split('_')
            .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
            .join(' ')
          await db.$transaction(async (tx) => {
            await tx.$executeRaw`SAVEPOINT stock_type_upsert`
            try {
              await tx.$executeRaw`
                INSERT INTO stock_type_definitions (
                  id, tenant_id, key, label, is_system, sort_order, created_at, updated_at
                ) VALUES (
                  gen_random_uuid(),
                  ${tenantId}::uuid,
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
                throw new AggregateError(
                  [cleanupErr, insertErr],
                  'Savepoint cleanup failed during stock-type upsert',
                )
              }
              if (!isUniqueViolation(insertErr)) throw insertErr
            }
          })
        }
      }

      let storageLocationId: string | null = null
      if (extracted.storageLocation?.trim()) {
        const storageName = extracted.storageLocation.trim()
        let storageLocation = await db.storageLocation.findFirst({
          where: {
            tenantId,
            locationId: location.id,
            name: storageName,
            deletedAt: null,
          },
          select: { id: true },
        })
        if (!storageLocation && !dryRun) {
          storageLocation = await db.storageLocation.create({
            data: {
              tenantId,
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
      }

      let batchId: string | null = null
      if (extracted.batchNumber?.trim()) {
        const batchNumber = extracted.batchNumber.trim()
        const product = await db.product.findFirst({
          where: { id: variant.productId, tenantId },
          select: { id: true, batchTracking: true },
        })
        if (product?.batchTracking) {
          const rawExpiry = extracted.expiryDate?.trim()
          const parsedExpiry = rawExpiry ? new Date(rawExpiry) : null
          if (rawExpiry && (!parsedExpiry || isNaN(parsedExpiry.getTime()))) {
            throw new InvalidDateError({ field: 'expiryDate', value: rawExpiry })
          }
          let batch = await db.batch.findFirst({
            where: { tenantId, productId: product.id, batchNumber },
          })
          if (!batch && !dryRun) {
            batch = await db.batch.create({
              data: {
                tenantId,
                productId: product.id,
                batchNumber,
                expiryDate: parsedExpiry,
                metadata: {},
              },
            })
          }
          if (batch) batchId = batch.id
        }
      }

      if (dryRun) {
        const existing = await db.stockLevel.findFirst({
          where: {
            tenantId,
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

      const outcome = await upsertStockLevel(db, tenantId, {
        variantId: variant.id,
        locationId: location.id,
        storageLocationId,
        batchId,
        stockType,
        quantity,
        source,
        createdBy: userId,
      })
      if (outcome === 'unchanged') result.updated += 1
      else result[outcome] += 1
    } catch (err) {
      log.error({ err, row: rowNumber }, 'stock import: row failed')
      const reason = sanitizeRowError(err)
      const rowRef = rows[i]
      const sku = rowRef ? extractSkuFallback(headers, rowRef) : undefined
      result.errors.push({ row: rowNumber, ...(sku ? { sku } : {}), reason })
    }
  }

  return result
}

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

function extractSkuFallback(headers: string[], row: string[]): string | undefined {
  const idx = headers.findIndex((h) => h.toLowerCase() === 'sku')
  if (idx >= 0) return row[idx]
  return undefined
}

// Suppress unused-import warning for the Prisma namespace import — kept so
// re-exporting Prisma types from this module stays a one-line change.
export type { Prisma }
