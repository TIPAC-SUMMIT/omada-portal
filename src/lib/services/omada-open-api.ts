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
  // The controller's extPortal endpoint expects the session duration in
  // milliseconds and adds it to the authorization start time.
  return durationSeconds * 1000
}

let tokenCache: { value: string; expiresAt: number } | null = null

function apiUrl(path: string): string {
  return `${ENV.OMADA_API_URL.replace(/\/$/, '')}${path}`
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

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value
  }

  if (!ENV.OMADA_CLIENT_ID || !ENV.OMADA_CLIENT_SECRET || !ENV.OMADA_OMADAC_ID) {
    throw new Error('OMADA_CLIENT_ID, OMADA_CLIENT_SECRET and OMADA_OMADAC_ID are required')
  }

  const response = await fetch(
    apiUrl('/openapi/authorize/token?grant_type=client_credentials'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        omadacId: ENV.OMADA_OMADAC_ID,
        client_id: ENV.OMADA_CLIENT_ID,
        client_secret: ENV.OMADA_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )

  const token = await parseResponse<AccessToken>(response)
  if (!token?.accessToken) throw new Error('Omada API did not return an access token')

  tokenCache = {
    value: token.accessToken,
    expiresAt: Date.now() + (token.expiresIn ?? 7200) * 1000,
  }
  return token.accessToken
}

export async function createOmadaVoucher(
  reference: string,
  durationSeconds: number,
  siteId = ENV.OMADA_SITE_ID
): Promise<GeneratedVoucher> {
  if (!siteId) {
    throw new Error('An Omada site ID is required to generate vouchers')
  }

  const token = await getAccessToken()
  const durationMinutes = calculateOmadaVoucherDurationMinutes(durationSeconds)
  const groupName = `TIPAC-${reference}`.slice(0, 32)

  const createResponse = await fetch(
    apiUrl(`/openapi/v1/${encodeURIComponent(ENV.OMADA_OMADAC_ID)}/sites/${encodeURIComponent(siteId)}/hotspot/voucher-groups`),
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
    apiUrl(`/openapi/v1/${encodeURIComponent(ENV.OMADA_OMADAC_ID)}/sites/${encodeURIComponent(siteId)}/hotspot/voucher-groups/${encodeURIComponent(created.id)}?page=1&pageSize=10`),
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

export async function listOmadaSites(): Promise<OmadaSite[]> {
  if (!ENV.OMADA_OMADAC_ID) {
    throw new Error('OMADA_OMADAC_ID is required to retrieve sites')
  }

  const token = await getAccessToken()
  const response = await fetch(
    apiUrl(`/openapi/v1/${encodeURIComponent(ENV.OMADA_OMADAC_ID)}/sites?page=1&pageSize=1000`),
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

async function controllerRequest<T>(
  path: string,
  init: RequestInit,
  cookies?: string
): Promise<{ data: T; cookies: string }> {
  const response = await fetch(
    `${ENV.OMADA_CONTROLLER_URL.replace(/\/$/, '')}/${encodeURIComponent(ENV.OMADA_CONTROLLER_ID)}${path}`,
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

export async function authorizeOmadaClient(input: OmadaClientAuthorization): Promise<void> {
  if (!ENV.OMADA_CONTROLLER_URL || !ENV.OMADA_CONTROLLER_ID ||
      !ENV.OMADA_OPERATOR_USERNAME || !ENV.OMADA_OPERATOR_PASSWORD) {
    throw new Error('OMADA_CONTROLLER_URL, OMADA_CONTROLLER_ID and hotspot operator credentials are required')
  }

  const login = await controllerRequest<{ token: string }>(
    '/api/v2/hotspot/login',
    {
      method: 'POST',
      body: JSON.stringify({
        name: ENV.OMADA_OPERATOR_USERNAME,
        password: ENV.OMADA_OPERATOR_PASSWORD,
      }),
    }
  )
  if (!login.data?.token) throw new Error('Omada controller did not return a CSRF token')

  const durationMillis = calculateOmadaExpiryMillis(Date.now(), input.durationSeconds)
  await controllerRequest(
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
