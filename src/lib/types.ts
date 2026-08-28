/**
 * Core TypeScript types for Omada Portal Platform
 */

// ============================================================================
// Database Enum Types (matches SQL schema)
// ============================================================================

export type AdminRole = 'SUPER_ADMIN' | 'SITE_ADMIN' | 'VIEWER'

export type SiteStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'

export type PackageStatus = 'ACTIVE' | 'INACTIVE' | 'DELETED'

export type PortalSessionStatus = 
  | 'CREATED'
  | 'PACKAGE_SELECTED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_SUCCESS'
  | 'AUTHORIZED'
  | 'EXPIRED'
  | 'FAILED'

export type TransactionStatus =
  | 'PENDING'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_TIMEOUT'
  | 'OMADA_AUTHORIZING'
  | 'AUTHORIZED'
  | 'AUTHORIZATION_FAILED'
  | 'EXPIRED'

export type AuthorizationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED'

export type AuditAction =
  | 'ADMIN_LOGIN'
  | 'ADMIN_LOGOUT'
  | 'ADMIN_CREATED'
  | 'ADMIN_UPDATED'
  | 'ADMIN_DELETED'
  | 'SITE_CREATED'
  | 'SITE_UPDATED'
  | 'SITE_DELETED'
  | 'CONTROLLER_CREATED'
  | 'CONTROLLER_UPDATED'
  | 'CONTROLLER_DELETED'
  | 'PACKAGE_CREATED'
  | 'PACKAGE_UPDATED'
  | 'PACKAGE_DELETED'
  | 'PACKAGE_PRICE_CHANGED'
  | 'PORTAL_SESSION_CREATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'CLIENT_AUTHORIZED'
  | 'CLIENT_AUTHORIZATION_FAILED'
  | 'CLIENT_REVOKED'
  | 'WEBHOOK_RECEIVED'
  | 'WEBHOOK_DUPLICATE'
  | 'WEBHOOK_INVALID'

// ============================================================================
// Database Entity Types
// ============================================================================

export interface Admin {
  id: string
  email: string
  password_hash: string
  name: string
  role: AdminRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Site {
  id: string
  name: string
  slug: string
  omada_site_id: string | null
  location: string | null
  description: string | null
  status: SiteStatus
  timezone: string
  created_at: string
  updated_at: string
}

export interface AdminSite {
  admin_id: string
  site_id: string
  created_at: string
}

export interface OmadaController {
  id: string
  site_id: string
  name: string
  controller_url: string | null
  omadac_id: string | null
  username: string | null
  password_secret_ref: string | null
  api_version: string
  is_active: boolean
  use_site_connector: boolean
  site_connector_url: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface AccessPoint {
  id: string
  site_id: string
  controller_id: string | null
  ap_mac: string
  name: string | null
  model: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SsidConfiguration {
  id: string
  site_id: string
  controller_id: string | null
  ssid_name: string
  vlan_id: number | null
  portal_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Package {
  id: string
  name: string
  description: string | null
  duration_seconds: number
  price_tzs: number
  status: PackageStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SitePackage {
  site_id: string
  package_id: string
  is_active: boolean
  created_at: string
}

export interface PortalSession {
  id: string
  session_token_hash: string
  site_id: string | null
  client_mac: string
  ap_mac: string
  ssid_name: string
  radio_id: string | null
  vid: string | null
  redirect_url: string | null
  selected_package_id: string | null
  status: PortalSessionStatus
  client_ip: string | null
  user_agent: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface PaymentTransaction {
  id: string
  reference: string
  site_id: string | null
  package_id: string | null
  portal_session_id: string | null
  client_mac: string
  ap_mac: string
  ssid_name: string
  phone_number: string
  amount_tzs: number
  malipopay_transaction_id: string | null
  status: TransactionStatus
  webhook_processed_at: string | null
  webhook_payload: any | null
  error_code: string | null
  error_message: string | null
  authorized_at: string | null
  expires_at: string | null
  duration_seconds: number | null
  omada_voucher_group_id?: string | null
  voucher_code?: string | null
  created_at: string
  updated_at: string
}

export interface ClientAuthorization {
  id: string
  transaction_id: string
  site_id: string | null
  portal_session_id: string | null
  client_mac: string
  ap_mac: string
  ssid_name: string
  status: AuthorizationStatus
  duration_seconds: number
  authorized_at: string
  expires_at: string
  revoked_at: string | null
  revoke_reason: string | null
  omada_response: any | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  action: AuditAction
  admin_id: string | null
  site_id: string | null
  transaction_id: string | null
  details: any | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface OmadaRedirectParams {
  clientMac: string
  apMac: string
  ssidName: string
  site?: string
  t?: string
  gatewayMac?: string
  radioId?: string
  vid?: string
  originUrl?: string
  redirectUrl?: string
  portalAuthUrl?: string
}

export interface CreatePortalSessionRequest {
  params: OmadaRedirectParams
}

export interface CreatePortalSessionResponse {
  sessionToken: string
  site: Site | null
  packages: Package[]
  expiresAt: string
}

export interface SelectPackageRequest {
  sessionToken: string
  packageId: string
}

export interface CreatePaymentRequest {
  sessionToken: string
  phoneNumber: string
}

export interface CreatePaymentResponse {
  reference: string
  amount: number
  phoneNumber: string
  status: 'initiated'
}

export interface PaymentStatusResponse {
  reference: string
  status: TransactionStatus
  message?: string
  redirectUrl?: string
  portalAuthUrl?: string
}

// ============================================================================
// MalipoPay Types
// ============================================================================

export interface MalipoPayCollectionRequest {
  reference: string
  description: string
  amount: number
  phoneNumber: string
  amountType: 'FULL'
}

export interface MalipoPayWebhookPayload {
  // Note: actual structure TBD - will be provided by client
  reference?: string
  status?: string
  transactionId?: string
  amount?: number
  phoneNumber?: string
  [key: string]: any
}

// ============================================================================
// Omada Controller Types
// ============================================================================

export interface OmadaAuthRequest {
  username: string
  password: string
}

export interface OmadaAuthResponse {
  // Structure TBD - depends on Omada API version
  token?: string
  sessionId?: string
  expires?: number
  [key: string]: any
}

export interface OmadaAuthorizeClientRequest {
  clientMac: string
  duration: number // minutes or seconds (TBD)
  // Additional fields TBD based on actual API
  vlan?: number
  bandwidthUp?: number
  bandwidthDown?: number
}

export interface OmadaAuthorizeClientResponse {
  success: boolean
  clientMac: string
  authorizedUntil?: string
  error?: string
  [key: string]: any
}

// ============================================================================
// Admin Dashboard Types
// ============================================================================

export interface DashboardStats {
  totalRevenue: number
  successfulPayments: number
  failedPayments: number
  activeClients: number
  expiredSessions: number
  todayTransactions: number
  revenueToday: number
  paymentSuccessRate: number
}

export interface SiteStats {
  siteId: string
  siteName: string
  revenue: number
  transactions: number
  activeClients: number
}

export interface PackageStats {
  packageId: string
  packageName: string
  sales: number
  revenue: number
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: AdminRole
  sites?: Site[] // for SITE_ADMIN role
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ErrorResponse {
  success: false
  error: string
  code?: string
  details?: any
}

// Type guards for safer type checking
export const isApiError = (response: any): response is ErrorResponse => {
  return response && response.success === false && typeof response.error === 'string'
}