/**
 * Application constants
 */

// ============================================================================
// Portal Session
// ============================================================================

export const PORTAL_SESSION_EXPIRY_MINUTES = 30

// ============================================================================
// Payment
// ============================================================================

export const PAYMENT_TIMEOUT_MINUTES = 15

// Transaction reference format: WIFI-YYYYMMDD-XXXXXXXX
export const TRANSACTION_REFERENCE_PREFIX = 'WIFI'
export const TRANSACTION_REFERENCE_LENGTH = 8 // random suffix length

// ============================================================================
// Authorization
// ============================================================================

// Default authorization duration if package doesn't specify
export const DEFAULT_AUTHORIZATION_DURATION_SECONDS = 3600 // 1 hour

// ============================================================================
// Phone number validation
// ============================================================================

// Tanzanian mobile number patterns
export const TZ_MOBILE_PATTERNS = {
  // Safaricom (M-Pesa): 25474X, 25475X, 25476X, 25477X, 25478X
  SAFARICOM: /^255(74[0-9]|75[0-9]|76[0-9]|77[0-9]|78[0-9])\d{6}$/,
  
  // Vodacom (M-Pesa): 25574X, 25575X, 25576X
  VODACOM: /^255(74[0-9]|75[0-9]|76[0-9])\d{6}$/,
  
  // Airtel: 25568X, 25669X, 25678X, 25679X
  AIRTEL: /^255(68[0-9]|69[0-9]|78[0-9]|79[0-9])\d{6}$/,
  
  // Tigo: 25571X, 25765X, 25767X
  TIGO: /^255(71[0-9]|65[0-9]|67[0-9])\d{6}$/,
  
  // Halotel: 25762X
  HALOTEL: /^255(62[0-9])\d{6}$/
}

// All supported patterns combined
export const TZ_MOBILE_PATTERN = /^255[6-9]\d{8}$/

// ============================================================================
// Rate Limiting
// ============================================================================

export const RATE_LIMITS = {
  // Guest portal endpoints
  PORTAL_CREATE_SESSION: { requests: 5, windowMs: 60_000 }, // 5 req/min per IP
  PAYMENT_CREATE: { requests: 3, windowMs: 60_000 }, // 3 payments/min per IP
  PAYMENT_STATUS: { requests: 20, windowMs: 60_000 }, // 20 status checks/min per IP
  
  // Admin endpoints
  ADMIN_LOGIN: { requests: 5, windowMs: 300_000 }, // 5 login attempts per 5 min
  ADMIN_API: { requests: 100, windowMs: 60_000 }, // 100 req/min for admin APIs
  
  // Webhook
  WEBHOOK: { requests: 50, windowMs: 60_000 }, // 50 webhooks/min per IP
}

// ============================================================================
// API Endpoints
// ============================================================================

export const API_ENDPOINTS = {
  // Guest portal
  PORTAL_SESSION: '/api/portal/session',
  PORTAL_PACKAGES: '/api/portal/packages',
  PAYMENT_CREATE: '/api/payment/create',
  PAYMENT_STATUS: '/api/payment/status',
  
  // Webhooks
  MALIPOPAY_WEBHOOK: '/api/malipopay/callback',
  
  // Admin auth
  ADMIN_LOGIN: '/api/admin/auth/login',
  ADMIN_LOGOUT: '/api/admin/auth/logout',
  ADMIN_ME: '/api/admin/auth/me',
  
  // Admin resources
  ADMIN_SITES: '/api/admin/sites',
  ADMIN_PACKAGES: '/api/admin/packages',
  ADMIN_TRANSACTIONS: '/api/admin/transactions',
  ADMIN_SESSIONS: '/api/admin/sessions',
  ADMIN_AUDIT_LOGS: '/api/admin/audit-logs',
  ADMIN_DASHBOARD: '/api/admin/dashboard',
}

// ============================================================================
// UI Constants
// ============================================================================

export const CURRENCY_FORMAT = new Intl.NumberFormat('en-TZ', {
  style: 'currency',
  currency: 'TZS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

// Format package duration for display
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''}`
  }
  
  if (hours >= 1) {
    return `${hours} hour${hours > 1 ? 's' : ''}`
  }
  
  return `${minutes} minute${minutes > 1 ? 's' : ''}`
}

// ============================================================================
// Validation
// ============================================================================

export const VALIDATION_RULES = {
  // Password requirements
  PASSWORD_MIN_LENGTH: 8,
  
  // Portal session token length
  SESSION_TOKEN_LENGTH: 32,
  
  // MAC address format
  MAC_ADDRESS_PATTERN: /^[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}$/,
  
  // Package constraints
  PACKAGE_MIN_PRICE: 100, // TZS 100 minimum
  PACKAGE_MAX_PRICE: 100000, // TZS 100,000 maximum
  PACKAGE_MIN_DURATION: 300, // 5 minutes minimum
  PACKAGE_MAX_DURATION: 86400 * 7, // 7 days maximum
}

// ============================================================================
// Error Codes
// ============================================================================

export const ERROR_CODES = {
  // Portal session errors
  INVALID_SESSION: 'INVALID_SESSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_OMADA_PARAMS: 'INVALID_OMADA_PARAMS',
  
  // Package errors
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
  PACKAGE_NOT_AVAILABLE: 'PACKAGE_NOT_AVAILABLE',
  PACKAGE_ALREADY_SELECTED: 'PACKAGE_ALREADY_SELECTED',
  
  // Payment errors
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  PAYMENT_ALREADY_INITIATED: 'PAYMENT_ALREADY_INITIATED',
  MALIPOPAY_ERROR: 'MALIPOPAY_ERROR',
  PAYMENT_TIMEOUT: 'PAYMENT_TIMEOUT',
  
  // Authorization errors
  OMADA_ERROR: 'OMADA_ERROR',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  CLIENT_ALREADY_AUTHORIZED: 'CLIENT_ALREADY_AUTHORIZED',
  
  // Admin errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ADMIN_NOT_FOUND: 'ADMIN_NOT_FOUND',
  
  // General errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
}

// ============================================================================
// HTTP Status Codes
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

// ============================================================================
// Environment Configuration
// ============================================================================

export const ENV = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  
  MALIPOPAY_API_TOKEN: process.env.MALIPOPAY_API_TOKEN!,
  MALIPOPAY_BASE_URL: process.env.MALIPOPAY_BASE_URL || 'https://core-prod.malipopay.co.tz/api/v1',
  MALIPOPAY_WEBHOOK_SECRET: process.env.MALIPOPAY_WEBHOOK_SECRET,
  
  OMADA_API_URL: process.env.OMADA_API_URL || 'https://euw1-omada-northbound.tplinkcloud.com',
  OMADA_CLIENT_ID: process.env.OMADA_CLIENT_ID || '',
  OMADA_CLIENT_SECRET: process.env.OMADA_CLIENT_SECRET || '',
  OMADA_OMADAC_ID: process.env.OMADA_OMADAC_ID || '',
  OMADA_SITE_ID: process.env.OMADA_SITE_ID || '',
  OMADA_SITE_NAME: process.env.OMADA_SITE_NAME || '',
  OMADA_CONTROLLER_URL: process.env.OMADA_CONTROLLER_URL || '',
  OMADA_CONTROLLER_ID: process.env.OMADA_CONTROLLER_ID || '',
  OMADA_OPERATOR_USERNAME: process.env.OMADA_OPERATOR_USERNAME || '',
  OMADA_OPERATOR_PASSWORD: process.env.OMADA_OPERATOR_PASSWORD || '',

  APP_URL: process.env.NEXT_PUBLIC_APP_URL!,
  PORTAL_SESSION_SECRET: process.env.PORTAL_SESSION_SECRET!,
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET!,
  
  MOCK_PAYMENTS: process.env.MOCK_PAYMENTS === 'true',
  MOCK_OMADA: process.env.MOCK_OMADA === 'true',
  
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const