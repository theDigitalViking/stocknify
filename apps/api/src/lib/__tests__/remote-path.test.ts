/**
 * Unit tests for the remote-path helpers introduced by the Cycle 5-E
 * Codex review fix. Pure functions, no DB / no IO.
 */

import { describe, expect, it } from 'vitest'

import {
  canonicalizeRemotePath,
  isUnderBase,
  joinRemotePath,
  normalizeBaseRoot,
  normalizeRelativeRemotePath,
} from '../remote-path.js'

describe('normalizeRelativeRemotePath (Codex 5-E F1)', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    ['\t', null],
    ['daily', 'daily'],
    ['daily/morning', 'daily/morning'],
    ['  daily  ', 'daily'],
    ['daily//morning', 'daily/morning'], // collapses repeated slashes
    ['a/b/c', 'a/b/c'],
    ['with-dashes_and_underscores', 'with-dashes_and_underscores'],
    ['unicode-ünterordner', 'unicode-ünterordner'],
    ['has space', 'has space'],
  ])('accepts %j → %j', (input, expected) => {
    const r = normalizeRelativeRemotePath(input as string | null | undefined)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(expected)
  })

  it.each([
    ['/exports', /relative/i],
    ['/etc/passwd', /relative/i],
    ['/', /relative/i],
    ['../escape', /\.\./],
    ['daily/../../etc', /\.\./],
    ['./current', /\.\./],
    ['daily/./morning', /\.\./],
    ['~root', /~/],
    ['~', /~/],
    ['foo\0bar', /NUL/i],
  ])('rejects %j with reason matching %s', (input, pattern) => {
    const r = normalizeRelativeRemotePath(input as string)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(pattern)
  })
})

describe('canonicalizeRemotePath', () => {
  it.each([
    ['/exports', '/exports'],
    ['/exports/', '/exports'],
    ['/exports/./daily', '/exports/daily'],
    ['/exports//daily', '/exports/daily'],
    ['/exports/daily/../weekly', '/exports/weekly'],
    ['/exports/.', '/exports'],
    ['/', '/'],
    ['exports/daily', 'exports/daily'],
    ['exports/./daily', 'exports/daily'],
  ])('canonicalizes %j → %j', (input, expected) => {
    expect(canonicalizeRemotePath(input)).toBe(expected)
  })

  it.each([
    '/..',
    '/exports/../..',
    '/../etc',
    '../escape',
    'foo/../..',
    'foo\0bar',
  ])('returns null for escape / invalid input %j', (input) => {
    expect(canonicalizeRemotePath(input)).toBeNull()
  })
})

describe('normalizeBaseRoot', () => {
  it.each([
    [null, '/'],
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['  ', '/'],
    ['/exports', '/exports'],
    ['/exports/', '/exports'],
    ['/exports//', '/exports'],
    ['exports', '/exports'], // missing leading slash gets added
    ['/exports/./daily', '/exports/daily'], // canonicalizes
    ['/exports/../etc', '/etc'], // canonicalizes; trust the operator's stored value
  ])('normalizes %j → %j', (input, expected) => {
    expect(normalizeBaseRoot(input as string | null | undefined)).toBe(expected)
  })
})

describe('isUnderBase', () => {
  it.each<[string, string, boolean]>([
    ['/exports', '/exports', true],
    ['/exports/daily', '/exports', true],
    ['/exports/daily/2026', '/exports', true],
    ['/etc', '/exports', false],
    ['/exportsfoo', '/exports', false], // not a true sub-path
    ['/Exports', '/exports', false], // case-sensitive
    // Root base accepts everything
    ['/anywhere', '/', true],
    ['/', '/', true],
    // Empty base also accepts everything (defensive — should be normalized first)
    ['/anything', '', true],
  ])('isUnderBase(%j, %j) = %s', (resolved, base, expected) => {
    expect(isUnderBase(resolved, base)).toBe(expected)
  })
})

describe('joinRemotePath (existing helper — pinned against importPath edge cases)', () => {
  it('absolute file argument overrides the dir (the original Codex F1 footgun)', () => {
    // This is the exact behaviour Codex flagged: when the second arg is
    // absolute, the dir is silently discarded. The fix lives at the call
    // sites (normalizeRelativeRemotePath rejects leading `/`), not in
    // joinRemotePath itself, because the worker still legitimately uses
    // absolute file paths (after listing).
    expect(joinRemotePath('/exports', '/etc')).toBe('/etc')
  })

  it('joins relative second-arg under the dir', () => {
    expect(joinRemotePath('/exports', 'daily')).toBe('/exports/daily')
    expect(joinRemotePath('/exports/', 'daily')).toBe('/exports/daily')
    expect(joinRemotePath('/', 'daily')).toBe('/daily')
  })
})
