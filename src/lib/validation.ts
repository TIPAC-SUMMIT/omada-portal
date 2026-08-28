/**
 * Zod validation schemas
 */

import { z } from 'zod'
import { 
  TZ_MOBILE_PATTERN, 
  VALIDATION_RULES,
  ERROR_CODES
} from './constants'
import type {
  AdminRole,
  SiteStatus,
  PackageStatus,
  OmadaRedirectParams
} from './types'

// ============================================================================
// Primitive Validators
// ============================================================================

export const uuidSchema = z.string().uuid()

export const emailSchema = z.string().email()

export const phoneSchema = z
  .string()
  .regex(TZ_MOBILE_PATTERN, 'Invalid Tanzanian mobile number')
  .transform(val => {
    // Normalize to 255XXXXXXXXX format
    const digits = val.replace(/\D/g, '')
    if (digits.startsWith('255')) return digits
    if (digits.startsWith('0')) return '255' + digits.slice(1)
    return '255' + digits
  })

export const macAddressSchema = z
  .string()
  .regex(VALIDATION_RULES.MAC_ADDRESS_PATTERN, 'Invalid MAC address format')
  .transform(val => val.toUpperCase())

export const slugSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')

export const passwordSchema = z
  .string()
  .min(VALIDATION_RULES.PASSWORD_MIN_LENGTH, `Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters`)

export const adminRoleSchema = z.enum(['SUPER_ADMIN', 'SITE_ADMIN', 'VIEWER'] as const)

export const siteStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const)

export const packageStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'DELETED'] as const)

// ============================================================================
// Omada Portal Schemas
// ============================================================================

export const omadaRedirectParamsSchema = z.object({
  clientMac: macAddressSchema,
  apMac: macAddressSchema,
  ssidName: z.string().min(1).max(32),
  radioId: z.string().optional(),
  vid: z.string().optional(),
  redirectUrl: z.string().url().optional(),
  portalAuthUrl: z.string().url().optional()
})

export const createPortalSessionSchema = z.object({
  params: omadaRedirectParamsSchema
})

export const selectPackageSchema = z.object({
  sessionToken: z.string().min(32),
  packageId: uuidSchema
})

export const createPaymentSchema = z.object({
  sessionToken: z.string().min(32),
  phoneNumber: phoneSchema
})

// ============================================================================
// Admin Schemas
// ============================================================================

export const createAdminSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(100),
  role: adminRoleSchema.default('VIEWER')
})

export const updateAdminSchema = z.object({
  email: emailSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  role: adminRoleSchema.optional(),
  is_active: z.boolean().optional()
})

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1)
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1)
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
})

// ============================================================================
// Site Schemas
// ============================================================================

export const createSiteSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  omada_site_id: z.string().min(1).max(100).optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  status: siteStatusSchema.default('ACTIVE'),
  timezone: z.string().default('Africa/Dar_es_Salaam')
})

export const updateSiteSchema = createSiteSchema.partial()

// ============================================================================
// Package Schemas
// ============================================================================

export const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  duration_seconds: z
    .number()
    .int()
    .min(60)    // 1 minute minimum
    .max(VALIDATION_RULES.PACKAGE_MAX_DURATION),
  price_tzs: z
    .number()
    .int()
    .min(VALIDATION_RULES.PACKAGE_MIN_PRICE)
    .max(VALIDATION_RULES.PACKAGE_MAX_PRICE),
  sort_order: z.number().int().min(0).default(0),
  status: packageStatusSchema.optional().default('ACTIVE')
})

export const updatePackageSchema = createPackageSchema.partial().extend({
  status: packageStatusSchema.optional()
})

// ============================================================================
// Omada Controller Schemas
// ============================================================================

export const createControllerSchema = z.object({
  site_id: uuidSchema,
  name: z.string().min(1).max(100),
  controller_url: z.string().url().optional(),
  omadac_id: z.string().max(100).optional(),
  username: z.string().max(100).optional(),
  password_secret_ref: z.string().max(100).optional(),
  api_version: z.string().default('v5'),
  use_site_connector: z.boolean().default(false),
  site_connector_url: z.string().url().optional()
})

export const updateControllerSchema = createControllerSchema.partial().extend({
  is_active: z.boolean().optional()
})

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
})

export const transactionFiltersSchema = z.object({
  site_id: uuidSchema.optional(),
  status: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  search: z.string().max(100).optional()
}).merge(paginationSchema)

export const auditLogFiltersSchema = z.object({
  action: z.string().optional(),
  admin_id: uuidSchema.optional(),
  site_id: uuidSchema.optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional()
}).merge(paginationSchema)

// ============================================================================
// Webhook Schemas
// ============================================================================

export const malipoPayWebhookSchema = z.object({
  // Basic required fields - actual structure TBD
  reference: z.string().optional(),
  status: z.string().optional(),
  transactionId: z.string().optional(),
  amount: z.number().optional(),
  phoneNumber: z.string().optional()
}).passthrough() // Allow additional unknown fields

// ============================================================================
// API Response Schemas
// ============================================================================

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional()
  })

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.any().optional()
})

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number()
    })
  })

// ============================================================================
// Form Validation Helpers
// ============================================================================

/**
 * Create form error object from Zod validation error
 */
export function createFormErrors<T>(error: z.ZodError<T>): Record<string, string> {
  const errors: Record<string, string> = {}
  
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    errors[path] = issue.message
  }
  
  return errors
}

/**
 * Validate and parse data with Zod schema
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data)
  
  if (result.success) {
    return { success: true, data: result.data }
  }
  
  return { success: false, errors: createFormErrors(result.error) }
}

/**
 * Middleware helper to validate request body
 */
export function validateRequestBody<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    const result = schema.safeParse(data)
    
    if (!result.success) {
      const errors = createFormErrors(result.error)
      throw new Error(`Validation failed: ${Object.values(errors).join(', ')}`)
    }
    
    return result.data
  }
}

/**
 * Validate query parameters
 */
export function validateQueryParams<T>(schema: z.ZodSchema<T>, params: URLSearchParams): T {
  const data = Object.fromEntries(params.entries())
  const result = schema.safeParse(data)
  
  if (!result.success) {
    throw new Error('Invalid query parameters')
  }
  
  return result.data
}