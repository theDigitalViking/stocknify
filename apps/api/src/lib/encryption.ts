/**
 * AES-256-GCM encrypt/decrypt helpers for sensitive credential fields.
 *
 * Wire format: `${iv_hex}:${authTag_hex}:${ciphertext_hex}` (single string).
 * - IV: 12 random bytes per call (NIST recommended size for GCM, never reused).
 * - Auth tag: 16 bytes (default GCM tag length).
 * - Key: 32 bytes derived from a 64-character hex string.
 *
 * Wire format is stable: changing it requires a re-encryption migration.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto'

import { config } from '../config.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH_HEX = 64
const KEY_LENGTH_BYTES = 32

function deriveKey(keyHex: string): Buffer {
  if (keyHex.length !== KEY_LENGTH_HEX || !/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error(`Encryption key must be ${String(KEY_LENGTH_HEX)} hex characters`)
  }
  const buf = Buffer.from(keyHex, 'hex')
  if (buf.length !== KEY_LENGTH_BYTES) {
    throw new Error(`Encryption key must decode to ${String(KEY_LENGTH_BYTES)} bytes`)
  }
  return buf
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = deriveKey(keyHex)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decrypt(encrypted: string, keyHex: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload — expected `iv:authTag:ciphertext`')
  }
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length — expected ${String(IV_LENGTH)} bytes`)
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length — expected ${String(AUTH_TAG_LENGTH)} bytes`)
  }
  const key = deriveKey(keyHex)
  const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

export function encryptCredential(plaintext: string): string {
  return encrypt(plaintext, config.CREDENTIALS_ENCRYPTION_KEY)
}

export function decryptCredential(encrypted: string): string {
  return decrypt(encrypted, config.CREDENTIALS_ENCRYPTION_KEY)
}

/**
 * Stable mask returned by API for credential reads. Never reveals
 * plaintext or ciphertext length — operators only need to know the field
 * is set, not how long the secret is.
 */
export const MASKED_SECRET = '••••••••'
