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
  durationSeconds: number
): Promise<GeneratedVoucher> {
  if (!ENV.OMADA_SITE_ID) {
    throw new Error('OMADA_SITE_ID is required to generate vouchers')
  }

  const token = await getAccessToken()
  const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60))
  const groupName = `TIPAC-${reference}`.slice(0, 32)

  const createResponse = await fetch(
    apiUrl(`/openapi/v1/${encodeURIComponent(ENV.OMADA_OMADAC_ID)}/sites/${encodeURIComponent(ENV.OMADA_SITE_ID)}/hotspot/voucher-groups`),
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
    apiUrl(`/openapi/v1/${encodeURIComponent(ENV.OMADA_OMADAC_ID)}/sites/${encodeURIComponent(ENV.OMADA_SITE_ID)}/hotspot/voucher-groups/${encodeURIComponent(created.id)}?page=1&pageSize=10`),
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
