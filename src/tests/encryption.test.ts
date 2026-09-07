/**
 * Tests for encryption utilities
 */

import { encryptCredential, decryptCredential, validateEncryptionKey } from '@/lib/encryption'

describe('Encryption', () => {
  const originalEnv = process.env.OMADA_CREDENTIAL_ENCRYPTION_KEY

  beforeEach(() => {
    const crypto = require('crypto')
    const testKey = crypto.randomBytes(32).toString('base64')
    process.env.OMADA_CREDENTIAL_ENCRYPTION_KEY = testKey
  })

  afterEach(() => {
    if (originalEnv) {
      process.env.OMADA_CREDENTIAL_ENCRYPTION_KEY = originalEnv
    } else {
      delete process.env.OMADA_CREDENTIAL_ENCRYPTION_KEY
    }
  })

  describe('encryptCredential and decryptCredential', () => {
    it('should roundtrip a secret credential', () => {
      const secret = 'my-super-secret-password-12345'
      const encrypted = encryptCredential(secret)
      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toBe(secret)
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/)

      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toBe(secret)
    })

    it('should produce different ciphertexts for same plaintext due to random IV', () => {
      const secret = 'test-password'
      const encrypted1 = encryptCredential(secret)
      const encrypted2 = encryptCredential(secret)

      expect(encrypted1).not.toBe(encrypted2)

      expect(decryptCredential(encrypted1)).toBe(secret)
      expect(decryptCredential(encrypted2)).toBe(secret)
    })

    it('should handle special characters', () => {
      const secret = '!@#$%^&*()-_=+[]{}|;:.,<>?/~`'
      const encrypted = encryptCredential(secret)
      const decrypted = decryptCredential(encrypted)
      expect(decrypted).toBe(secret)
    })

    it('should throw on empty plaintext', () => {
      expect(() => encryptCredential('')).toThrow()
    })

    it('should throw on empty ciphertext', () => {
      expect(() => decryptCredential('')).toThrow()
    })

    it('should throw on invalid ciphertext format', () => {
      expect(() => decryptCredential('invalid-base64')).toThrow()
    })

    it('should throw on tampered ciphertext (fails auth tag validation)', () => {
      const secret = 'test-password'
      const encrypted = encryptCredential(secret)
      
      const buffer = Buffer.from(encrypted, 'base64')
      if (buffer.length > 32) {
        buffer[32] = buffer[32] ^ 0xFF
      }
      const tampered = buffer.toString('base64')

      expect(() => decryptCredential(tampered)).toThrow()
    })
  })

  describe('validateEncryptionKey', () => {
    it('should return valid when key is set', () => {
      const result = validateEncryptionKey()
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should return invalid when key is missing', () => {
      delete process.env.OMADA_CREDENTIAL_ENCRYPTION_KEY
      const result = validateEncryptionKey()
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error).toContain('OMADA_CREDENTIAL_ENCRYPTION_KEY')
    })

    it('should return invalid when key is wrong size', () => {
      process.env.OMADA_CREDENTIAL_ENCRYPTION_KEY = 'c2hvcnQta2V5'
      const result = validateEncryptionKey()
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error).toContain('32 bytes')
    })
  })
})
