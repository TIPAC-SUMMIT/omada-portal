/**
 * Encryption utilities for storing controller credentials at rest
 * Uses AES-256-GCM with Node.js crypto module
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// Environment variable for encryption key
const ENCRYPTION_KEY_ENV = 'OMADA_CREDENTIAL_ENCRYPTION_KEY'

/**
 * Validates and derives the encryption key
 * Must be exactly 32 bytes (256 bits) or will be derived via scrypt
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env[ENCRYPTION_KEY_ENV]
  
  if (!keyString) {
    throw new Error(
      `Missing required environment variable: ${ENCRYPTION_KEY_ENV}. ` +
      `Generate a 32-byte base64-encoded key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    )
  }

  let keyBuffer: Buffer
  try {
    // Try to decode as base64
    keyBuffer = Buffer.from(keyString, 'base64')
    if (keyBuffer.length !== 32) {
      throw new Error(
        `Encryption key must be exactly 32 bytes (256 bits). Got ${keyBuffer.length} bytes. ` +
        `Regenerate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Encryption key must be exactly 32 bytes')) {
      throw error
    }
    // If base64 decode failed, try to use the string directly via scrypt
    if (keyString.length < 32) {
      throw new Error(
        `Encryption key string is too short. Use base64-encoded 32-byte key instead: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
      )
    }
    keyBuffer = scryptSync(keyString, 'omada-credential', 32)
  }

  return keyBuffer
}

/**
 * Encrypts a credential string using AES-256-GCM
 * Returns IV + ciphertext + auth tag concatenated
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty credential')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(16) // 128-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // Concatenate IV + authTag + ciphertext, encode as base64
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')])
  return combined.toString('base64')
}

/**
 * Decrypts a credential string encrypted with encryptCredential
 */
export function decryptCredential(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty credential')
  }

  const key = getEncryptionKey()
  const combined = Buffer.from(encrypted, 'base64')

  if (combined.length < 32) {
    throw new Error('Invalid encrypted credential format')
  }

  const iv = combined.slice(0, 16)
  const authTag = combined.slice(16, 32)
  const ciphertext = combined.slice(32).toString('hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Validates encryption key is set and valid
 * Use this for startup checks and admin operations
 */
export function validateEncryptionKey(): { valid: boolean; error?: string } {
  try {
    getEncryptionKey()
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown encryption error'
    }
  }
}
