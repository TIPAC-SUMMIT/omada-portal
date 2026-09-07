/**
 * Omada Open API client
 * Supports per-controller configuration with global ENV fallback
 */

import { ENV } from '../constants'

interface OmadaApiResponse<T> {
  errorCode: number
  msg?: string
  result?: T
}

interface VoucherGroup {
  id: string
  data?: Array<{ id: string; code: string; status: number }>
}

export interface OmadaSite {
  siteId: string
  name: string
  [key: string]: unknown
}

interface AccessToken {
  accessToken: string
  expiresIn?: number
}

export interface GeneratedVoucher {
  groupId: string
  code: string
}

export interface OmadaClientAuthorization {
  clientMac: string
  apMac: string
  ssidName: string
  radioId: string
  site: string
  durationSeconds: number
}

export interface OmadaVoucherAuthorization {
  clientMac: string
  apMac: string
  ssidName: string
  radioId: string
  site: string
  voucherCode: string
}

// ============================================================================
// Controller Configuration
// ============================================================================

export interface CloudApiConfig {
  apiUrl: string
  clientId: string
  clientSecret: string
  omadacId: string
}

export interface ControllerCredentials {
  controllerUrl: string
  controllerId: string
  username: string
  password: string
}

// Per-controller token caches to avoid cross-controller pollution
const tokenCaches = new Map<string, { value: string; expiresAt: number } | null>()

export function calculateOmadaVoucherDurationMinutes(durationSeconds: number): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 60) {
    throw new Error('Omada authorization duration must be at least 60 seconds')
  }
  return Math.ceil(durationSeconds / 60)
}

export function calculateOmadaExpiryMillis(_nowMillis: number, durationSeconds: number): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 60) {
    throw new Error('Omada authorization duration must be at least 60 seconds')
  }
  return durationSeconds * 1000
}

// ============================================================================
// Fallback Configuration (legacy global ENV)
// ============================================================================

/**
 * Gets fallback cloud API config from environment
 * Used when no controller-specific config is provided
 */
function getFallbackCloudApiConfig(): CloudApiConfig | null {
  if (!ENV.OMADA_API_URL || !ENV.OMADA_CLIENT_ID || !ENV.OMADA_CLIENT_SECRET || !ENV.OMADA_OMADAC_ID) {
    return null
  }
  return {
    apiUrl: ENV.OMADA_API_URL,
    clientId: ENV.OMADA_CLIENT_ID,
    clientSecret: ENV.OMADA_CLIENT_SECRET,
    omadacId: ENV.OMADA_OMADAC_ID
  }
}

/**
 * Gets fallback controller credentials from environment
 * Used when no controller-specific config is provided
 */
function getFallbackControllerCredentials(): ControllerCredentials | null {
  if (!ENV.OMADA_CONTROLLER_URL || !ENV.OMADA_CONTROLLER_ID ||
      !ENV.OMADA_OPERATOR_USERNAME || !ENV.OMADA_OPERATOR_PASSWORD) {
    return null
  }
  return {
    controllerUrl: ENV.OMADA_CONTROLLER_URL,
    controllerId: ENV.OMADA_CONTROLLER_ID,
    username: ENV.OMADA_OPERATOR_USERNAME,
    password: ENV.OMADA_OPERATOR_PASSWORD
  }
}

// ============================================================================
// API Request Helpers
// ============================================================================

function apiUrl(config: CloudApiConfig, path: string): string {
  return `${config.apiUrl.replace(/\/$/, '')}${path}`
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: OmadaApiResponse<T>
  try {
    body = JSON.parse(text) as OmadaApiResponse<T>
  } catch {
    throw new Error(`Omada API returned non-JSON response (${response.status})`)
  }

  if (!response.ok || body.errorCode !== 0) {
    throw new Error(body.msg || `Omada API request failed (${response.status})`)
  }
  return body.result as T
}

async function getAccessToken(config: CloudApiConfig): Promise<string> {
  const cacheKey = `${config.omadacId}:${config.clientId}`
  const cached = tokenCaches.get(cacheKey)

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.value
  }

  const response = await fetch(
    apiUrl(config, '/openapi/authorize/token?grant_type=client_credentials'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        omadacId: config.omadacId,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )

  const token = await parseResponse<AccessToken>(response)
  if (!token?.accessToken) throw new Error('Omada API did not return an access token')

  const tokenData = {
    value: token.accessToken,
    expiresAt: Date.now() + (token.expiresIn ?? 7200) * 1000,
  }

  tokenCaches.set(cacheKey, tokenData)
  return token.accessToken
}

// ============================================================================
// Cloud API: Voucher Management
// ============================================================================

export async function createOmadaVoucher(
  reference: string,
  durationSeconds: number,
  siteId?: string,
  config?: CloudApiConfig
): Promise<GeneratedVoucher> {
  const finalConfig = config || getFallbackCloudApiConfig()
  if (!finalConfig) {
    throw new Error('Cloud API configuration is required (from controller or global ENV)')
  }

  const finalSiteId = siteId || ENV.OMADA_SITE_ID
  if (!finalSiteId) {
    throw new Error('An Omada site ID is required to generate vouchers')
  }

  const token = await getAccessToken(finalConfig)
  const durationMinutes = calculateOmadaVoucherDurationMinutes(durationSeconds)
  const groupName = `TIPAC-${reference}`.slice(0, 32)

  const createResponse = await fetch(
    apiUrl(finalConfig, `/openapi/v1/${encodeURIComponent(finalConfig.omadacId)}/sites/${encodeURIComponent(finalSiteId)}/hotspot/voucher-groups`),
    {
      method: 'POST',
      headers: {
        Authorization: `AccessToken=${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: groupName,
        amount: 1,
        codeLength: 8,
        codeForm: [0, 1],
        limitType: 0,
        limitNum: 1,
        durationType: 0,
        duration: durationMinutes,
        timingType: 0,
        rateLimit: {
          mode: 0,
          customRateLimit: { downLimitEnable: false, upLimitEnable: false },
        },
        trafficLimitEnable: false,
        applyToAllPortals: true,
        description: `Generated for ${reference}`,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )

  const created = await parseResponse<{ id: string }>(createResponse)
  if (!created?.id) throw new Error('Omada API did not return a voucher group ID')

  const detailResponse = await fetch(
    apiUrl(finalConfig, `/openapi/v1/${encodeURIComponent(finalConfig.omadacId)}/sites/${encodeURIComponent(finalSiteId)}/hotspot/voucher-groups/${encodeURIComponent(created.id)}?page=1&pageSize=10`),
    {
      headers: {
        Authorization: `AccessToken=${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    }
  )

  const group = await parseResponse<VoucherGroup>(detailResponse)
  const voucher = group?.data?.find(item => item.status === 0) ?? group?.data?.[0]
  if (!voucher?.code) throw new Error('Omada API created a voucher group without a code')

  return { groupId: created.id, code: voucher.code }
}

export async function listOmadaSites(config?: CloudApiConfig): Promise<OmadaSite[]> {
  const finalConfig = config || getFallbackCloudApiConfig()
  if (!finalConfig) {
    throw new Error('Cloud API configuration is required (from controller or global ENV)')
  }

  const token = await getAccessToken(finalConfig)
  const response = await fetch(
    apiUrl(finalConfig, `/openapi/v1/${encodeURIComponent(finalConfig.omadacId)}/sites?page=1&pageSize=1000`),
    {
      headers: {
        Authorization: `AccessToken=${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    }
  )

  const result = await parseResponse<{
    data?: OmadaSite[]
    totalRows?: number
  }>(response)

  return result?.data ?? []
}

// ============================================================================
// Controller API: Hotspot Authorization
// ============================================================================

async function controllerRequest<T>(
  config: ControllerCredentials,
  path: string,
  init: RequestInit,
  cookies?: string
): Promise<{ data: T; cookies: string }> {
  const response = await fetch(
    `${config.controllerUrl.replace(/\/$/, '')}/${encodeURIComponent(config.controllerId)}${path}`,
    {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    }
  )
  const text = await response.text()
  let body: OmadaApiResponse<T>
  try {
    body = JSON.parse(text) as OmadaApiResponse<T>
  } catch {
    throw new Error(`Omada controller returned non-JSON response (${response.status})`)
  }
  if (!response.ok || body.errorCode !== 0) {
    throw new Error(body.msg || `Omada controller request failed (${response.status})`)
  }
  const setCookies = response.headers.getSetCookie?.() ?? []
  const receivedCookies = setCookies.map(value => value.split(';', 1)[0]).join('; ')
  return { data: body.result as T, cookies: [cookies, receivedCookies].filter(Boolean).join('; ') }
}

export async function authorizeOmadaClient(
  input: OmadaClientAuthorization,
  config?: ControllerCredentials
): Promise<void> {
  const finalConfig = config || getFallbackControllerCredentials()
  if (!finalConfig) {
    throw new Error('Controller credentials are required (from controller or global ENV)')
  }

  const login = await controllerRequest<{ token: string }>(
    finalConfig,
    '/api/v2/hotspot/login',
    {
      method: 'POST',
      body: JSON.stringify({
        name: finalConfig.username,
        password: finalConfig.password,
      }),
    }
  )
  if (!login.data?.token) throw new Error('Omada controller did not return a CSRF token')

  const durationMillis = calculateOmadaExpiryMillis(Date.now(), input.durationSeconds)
  await controllerRequest(
    finalConfig,
    '/api/v2/hotspot/extPortal/auth',
    {
      method: 'POST',
      headers: { 'Csrf-Token': login.data.token },
      body: JSON.stringify({
        clientMac: input.clientMac,
        apMac: input.apMac,
        ssidName: input.ssidName,
        radioId: input.radioId,
        site: input.site || ENV.OMADA_SITE_NAME,
        time: durationMillis,
        authType: 4,
      }),
    },
    login.cookies
  )
}

export async function authorizeOmadaVoucher(
  input: OmadaVoucherAuthorization,
  config?: ControllerCredentials
): Promise<void> {
  const finalConfig = config || getFallbackControllerCredentials()
  if (!finalConfig) {
    throw new Error('Controller credentials are required (from controller or global ENV)')
  }

  const voucherCode = input.voucherCode.trim()
  if (!voucherCode) throw new Error('Voucher code is required')

  const login = await controllerRequest<{ token: string }>(
    finalConfig,
    '/api/v2/hotspot/login',
    {
      method: 'POST',
      body: JSON.stringify({
        name: finalConfig.username,
        password: finalConfig.password,
      }),
    }
  )
  if (!login.data?.token) throw new Error('Omada controller did not return a CSRF token')

  await controllerRequest(
    finalConfig,
    '/api/v2/hotspot/extPortal/auth',
    {
      method: 'POST',
      headers: { 'Csrf-Token': login.data.token },
      body: JSON.stringify({
        clientMac: input.clientMac,
        apMac: input.apMac,
        ssidName: input.ssidName,
        radioId: input.radioId,
        site: input.site || ENV.OMADA_SITE_NAME,
        voucherCode,
        authType: 3,
      }),
    },
    login.cookies
  )
}
