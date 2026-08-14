/**
 * Admin JWT Authentication Library
 */

import { SignJWT, jwtVerify } from 'jose'
import { ENV } from '@/lib/constants'
import type { AdminRole } from '@/lib/types'

const secret = new TextEncoder().encode(ENV.ADMIN_JWT_SECRET || 'dev-secret-change-me')

export interface AdminJwtPayload {
  sub: string        // admin id
  email: string
  name: string
  role: AdminRole
  sites?: string[]   // site IDs for SITE_ADMIN
  iat?: number
  exp?: number
}

const TOKEN_EXPIRY = '8h'

export async function signAdminToken(payload: Omit<AdminJwtPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secret)
}

export async function verifyAdminToken(token: string): Promise<AdminJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as AdminJwtPayload
  } catch {
    return null
  }
}

/**
 * Extract admin token from request (Authorization header or cookie)
 */
export function extractAdminToken(request: Request): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Try cookie
  const cookie = request.headers.get('cookie')
  if (cookie) {
    const match = cookie.match(/admin_token=([^;]+)/)
    if (match) return match[1]
  }

  return null
}

/**
 * Verify request and return admin payload, or null if unauthorized
 */
export async function requireAdmin(request: Request): Promise<AdminJwtPayload | null> {
  const token = extractAdminToken(request)
  if (!token) return null
  return verifyAdminToken(token)
}

/**
 * Check if admin has access to a specific site
 */
export function canAccessSite(admin: AdminJwtPayload, siteId: string): boolean {
  if (admin.role === 'SUPER_ADMIN') return true
  if (admin.role === 'SITE_ADMIN') return admin.sites?.includes(siteId) ?? false
  return false
}
