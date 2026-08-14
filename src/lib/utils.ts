/**
 * Utility functions
 */

import { randomBytes } from 'crypto'
import { format } from 'date-fns'
import { TZ_MOBILE_PATTERN, TRANSACTION_REFERENCE_PREFIX, VALIDATION_RULES } from './constants'
import type { ApiResponse } from './types'

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate Tanzanian mobile number format
 */
export function validateTanzanianPhone(phone: string): boolean {
  return TZ_MOBILE_PATTERN.test(phone)
}

/**
 * Normalize phone number to E.164 format (255XXXXXXXXX)
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')
  
  // Handle different input formats
  if (digits.startsWith('255')) {
    return digits
  }
  
  if (digits.startsWith('0') && digits.length === 10) {
    return '255' + digits.slice(1)
  }
  
  if (digits.length === 9) {
    return '255' + digits
  }
  
  throw new Error('Invalid phone number format')
}

/**
 * Validate MAC address format
 */
export function validateMacAddress(mac: string): boolean {
  return VALIDATION_RULES.MAC_ADDRESS_PATTERN.test(mac)
}

/**
 * Normalize MAC address to uppercase with colons
 */
export function normalizeMacAddress(mac: string): string {
  // Remove all non-hex characters
  const hex = mac.replace(/[^0-9A-Fa-f]/g, '')
  
  if (hex.length !== 12) {
    throw new Error('Invalid MAC address')
  }
  
  return hex.toUpperCase().match(/.{2}/g)?.join(':') || hex
}

// ============================================================================
// Cryptographic Utilities
// ============================================================================

/**
 * Generate cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('hex')
}

/**
 * Generate unique transaction reference
 */
export function generateTransactionReference(): string {
  const date = format(new Date(), 'yyyyMMdd')
  const random = randomBytes(4).toString('hex').toUpperCase()
  return `${TRANSACTION_REFERENCE_PREFIX}-${date}-${random}`
}

/**
 * Hash portal session token for database storage
 */
export function hashSessionToken(token: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ============================================================================
// API Response Utilities
// ============================================================================

/**
 * Create success API response
 */
export function apiSuccess<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message })
  }
}

/**
 * Create error API response
 */
export function apiError(error: string, code?: string, details?: any): ApiResponse {
  return {
    success: false,
    error,
    ...(code && { code }),
    ...(details && { details })
  }
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Get current timestamp in ISO format
 */
export function now(): string {
  return new Date().toISOString()
}

/**
 * Add seconds to current time
 */
export function addSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

/**
 * Add minutes to current time
 */
export function addMinutes(minutes: number): string {
  return addSeconds(minutes * 60)
}

/**
 * Check if timestamp is in the past
 */
export function isPast(timestamp: string): boolean {
  return new Date(timestamp) < new Date()
}

/**
 * Check if timestamp is in the future
 */
export function isFuture(timestamp: string): boolean {
  return new Date(timestamp) > new Date()
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Generate URL-safe slug from string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Truncate string to maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Mask phone number for display (show last 4 digits)
 */
export function maskPhoneNumber(phone: string): string {
  if (phone.length < 4) return phone
  return phone.slice(0, -4).replace(/\d/g, 'X') + phone.slice(-4)
}

/**
 * Mask MAC address for display (show last 4 chars)
 */
export function maskMacAddress(mac: string): string {
  const parts = mac.split(':')
  if (parts.length !== 6) return mac
  return 'XX:XX:XX:XX:' + parts.slice(-2).join(':')
}

// ============================================================================
// Object Utilities
// ============================================================================

/**
 * Remove undefined values from object
 */
export function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined)
  ) as Partial<T>
}

/**
 * Pick specific keys from object
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key]
    }
  }
  return result
}

/**
 * Omit specific keys from object
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj }
  for (const key of keys) {
    delete result[key]
  }
  return result
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Group array elements by key
 */
export function groupBy<T, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key])
    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

/**
 * Remove duplicates from array based on key
 */
export function uniqueBy<T, K extends keyof T>(array: T[], key: K): T[] {
  const seen = new Set()
  return array.filter(item => {
    const keyValue = item[key]
    if (seen.has(keyValue)) {
      return false
    }
    seen.add(keyValue)
    return true
  })
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if error is a known error type
 */
export function isKnownError(error: unknown): error is Error {
  return error instanceof Error
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === 'string') {
    return error
  }
  
  return 'Unknown error occurred'
}

/**
 * Log error with context
 */
export function logError(error: unknown, context?: string): void {
  const message = getErrorMessage(error)
  const prefix = context ? `[${context}]` : '[ERROR]'
  
  console.error(prefix, message, error)
}

// ============================================================================
// Development Utilities
// ============================================================================

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Conditional console.log for development
 */
export function devLog(...args: any[]): void {
  if (isDevelopment()) {
    console.log('[DEV]', ...args)
  }
}
// ── Re-exported from validation for backwards-compat ──────────────────────────
export { validateSchema, validateRequestBody, validateQueryParams } from './validation'
