// Error classes + sanitizer that keep `result.errors[].reason` free of
// Prisma / Postgres internals while preserving full context for
// `request.log.error`. Subclasses store structured fields as readonly
// public properties so pino's err serializer captures them server-side
// even when the user-facing `error.message` is the safe public string.

import { Prisma } from '@prisma/client'

export class VariantNotFoundError extends Error {
  public readonly sku?: string
  public readonly barcode?: string

  constructor(params: { sku?: string; barcode?: string }) {
    super('Product variant not found — no match for SKU or barcode')
    this.name = 'VariantNotFoundError'
    if (params.sku !== undefined) this.sku = params.sku
    if (params.barcode !== undefined) this.barcode = params.barcode
  }
}

export class InvalidNumberError extends Error {
  public readonly field: string
  public readonly value: string

  constructor(params: { field: string; value: string }) {
    super(`Invalid number for field "${params.field}": "${params.value}"`)
    this.name = 'InvalidNumberError'
    this.field = params.field
    this.value = params.value
  }
}

export class InvalidDateError extends Error {
  public readonly field: string
  public readonly value: string

  constructor(params: { field: string; value: string }) {
    super(`Invalid date format for field "${params.field}": "${params.value}"`)
    this.name = 'InvalidDateError'
    this.field = params.field
    this.value = params.value
  }
}

export class StockLevelInvariantError extends Error {
  public readonly variantId: string
  public readonly locationId: string
  public readonly stockType: string

  constructor(params: { variantId: string; locationId: string; stockType: string }) {
    // The IDs travel as readonly properties; the public message MUST NOT
    // contain them. sanitizeRowError returns this message verbatim.
    super('Internal consistency error during stock import — see server logs')
    this.name = 'StockLevelInvariantError'
    this.variantId = params.variantId
    this.locationId = params.locationId
    this.stockType = params.stockType
  }
}

const PRISMA_CODE_MESSAGES: Record<string, string> = {
  P2002: 'Row skipped — concurrent write detected',
  P2025: 'Required record not found',
}

// Public contract: returns a user-safe string. Never includes raw err.message,
// err.code, UUIDs, schema names, or other internals — except where this file
// explicitly chooses to surface them (e.g. P2000 column_name, which is part of
// the documented schema and acceptable to echo back).
export function sanitizeRowError(err: unknown): string {
  if (
    err instanceof VariantNotFoundError ||
    err instanceof InvalidNumberError ||
    err instanceof InvalidDateError ||
    err instanceof StockLevelInvariantError
  ) {
    return err.message
  }
  if (err instanceof AggregateError) {
    return err.message
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return PRISMA_CODE_MESSAGES.P2002 as string
    if (err.code === 'P2010') {
      const rawCode = err.meta?.['code']
      if (typeof rawCode === 'string' && rawCode === '23505') {
        return PRISMA_CODE_MESSAGES.P2002 as string
      }
    }
    if (err.code === 'P2000') {
      const column = err.meta?.['column_name']
      return typeof column === 'string'
        ? `Field value exceeds the allowed length for column "${column}"`
        : 'Field value exceeds the allowed length'
    }
    if (err.code === 'P2025') return PRISMA_CODE_MESSAGES.P2025 as string
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'ROW_LIMIT_EXCEEDED'
  ) {
    return 'Row limit exceeded'
  }
  return 'Data integrity violation — see server logs'
}

// Convenience predicate: true iff `sanitizeRowError(err)` returns something
// other than the generic 'Data integrity violation' fallback. Shipping it
// alongside the sanitizer lets a future test (no harness exists today) assert
// the contract without having to reimplement it.
export function isWhitelistedError(err: unknown): boolean {
  return sanitizeRowError(err) !== 'Data integrity violation — see server logs'
}
