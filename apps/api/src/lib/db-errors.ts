import { Prisma } from '@prisma/client'

// Unique-violation detection across both ORM and raw SQL paths.
//   P2002 — Prisma Client ORM unique violation (create/update via prisma.*).
//   P2010 — raw query error; unique violations surface as SQLSTATE 23505
//           on `err.meta.code`. `tx.$executeRaw` goes through this path.
// Any other error shape is treated as non-unique so the caller aborts the
// transaction correctly.
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (err.code === 'P2002') return true
  if (err.code === 'P2010') {
    const rawCode = err.meta?.['code']
    return typeof rawCode === 'string' && rawCode === '23505'
  }
  return false
}
