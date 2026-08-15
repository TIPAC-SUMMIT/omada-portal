/**
 * Omada Controller Service — Real Implementation
 *
 * OC200 v1.0 / Controller 6.2.14.12 via Omada Cloud Connector
 *
 * API base:  https://euw1-api-omada-controller-connector.tplinkcloud.com/{omadacId}/api/v2
 *
 * Flow:
 *  1. POST /hotspot/login  → get CSRF token + session cookie
 *  2. POST /hotspot/extPortal/auth  → authorize client MAC
 *
 * Notes:
 *  - Cookie name is TPOMADA_SESSIONID (controller v5.11+)
 *  - CSRF token must be in Csrf-Token header on step 2
 *  - time field in auth payload is milliseconds (microseconds in old docs — v6 uses ms)
 *  - Self-signed cert → rejectUnauthorized: false
 */

import { ENV } from '../constants'
import { logError, devLog } from '../utils'
import type { OmadaController, OmadaAuthorizeClientRequest, OmadaAuthorizeClientResponse } from '../types'

// ── Interface ──────────────────────────────────────────────────────────────────
export interface IOmadaService {
  authorizeClient(
    controller: OmadaController,
    request: OmadaAuthorizeClientRequest
  ): Promise<OmadaAuthorizeClientResponse>

  revokeClient(
    controller: OmadaController,
    clientMac: string
  ): Promise<{ success: boolean; error?: string }>

  testConnection(controller: OmadaController): Promise<{ success: boolean; error?: string }>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface OmadaSession {
  csrfToken: string
  sessionCookie: string
  expiresAt: number
}

// Session cache per controller (in-process; serverless safe — re-auth on cold start)
const sessionCache = new Map<string, OmadaSession>()

function buildBaseUrl(controller: OmadaController): string {
  const connectorUrl = controller.controller_url ||
    'https://euw1-api-omada-controller-connector.tplinkcloud.com'
  const omadacId = controller.omadac_id || ENV.OMADA_CONTROLLER_URL
  return `${connectorUrl}/${omadacId}/api/v2`
}

// Node.js fetch — handles OC200 redirects that point to local IP
// When OC200 redirects to https://192.168.0.56:443/..., we rewrite to tunnel URL
async function omadaFetch(
  url: string,
  options: RequestInit & { cookie?: string } = {},
  tunnelUrl?: string
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    redirect: 'manual',   // don't auto-follow — we need to rewrite redirects
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.cookie && { 'Cookie': options.cookie }),
      ...(options.headers || {})
    }
  })

  // If OC200 redirects (301/302/307/308), rewrite the location to use tunnel URL
  if ([301, 302, 307, 308].includes(res.status)) {
    const location = res.headers.get('location') || ''
    if (location && tunnelUrl) {
      // Replace local IP with tunnel URL
      const rewritten = location
        .replace(/https?:\/\/192\.168\.\d+\.\d+(:\d+)?/, tunnelUrl)
        .replace(/https?:\/\/localhost(:\d+)?/, tunnelUrl)

      console.log(JSON.stringify({ level: 'info', event: 'OMADA_REDIRECT_REWRITE', from: location, to: rewritten }))

      return omadaFetch(rewritten, options, tunnelUrl)
    }
  }

  return res
}

// ── Real Implementation ────────────────────────────────────────────────────────

class RealOmadaService implements IOmadaService {
  private async login(controller: OmadaController): Promise<OmadaSession> {
    const baseUrl = buildBaseUrl(controller)
    const username = controller.username || process.env.OMADA_USERNAME || ''
    const password = process.env[controller.password_secret_ref || ''] ||
      process.env.OMADA_PASSWORD || ''

    if (!username || !password) {
      throw new Error('Omada operator credentials not configured')
    }

    const loginUrl = `${baseUrl}/hotspot/login`
    const tunnelUrl = controller.controller_url || ''

    console.log(JSON.stringify({ level: 'info', event: 'OMADA_LOGIN', url: loginUrl, username }))

    const res = await omadaFetch(loginUrl, {
      method: 'POST',
      body: JSON.stringify({ name: username, password })
    }, tunnelUrl)

    const text = await res.text()
    let body: any
    try { body = JSON.parse(text) } catch {
      throw new Error(`Omada login non-JSON response: ${text.slice(0, 200)}`)
    }

    if (body.errorCode !== 0) {
      throw new Error(`Omada login failed: errorCode=${body.errorCode} msg=${body.msg}`)
    }

    const csrfToken: string = body.result?.token
    if (!csrfToken) {
      throw new Error('Omada login: no CSRF token in response')
    }

    // Extract session cookie from response headers
    const setCookie = res.headers.get('set-cookie') || ''
    const sessionMatch = setCookie.match(/TPOMADA_SESSIONID=([^;]+)/)
    const sessionCookie = sessionMatch
      ? `TPOMADA_SESSIONID=${sessionMatch[1]}`
      : ''

    const session: OmadaSession = {
      csrfToken,
      sessionCookie,
      expiresAt: Date.now() + 25 * 60 * 1000  // 25 minutes (token lasts 30 min)
    }

    console.log(JSON.stringify({ level: 'info', event: 'OMADA_LOGIN_OK', hasSession: !!sessionCookie }))

    return session
  }

  private async getSession(controller: OmadaController): Promise<OmadaSession> {
    const cacheKey = controller.id || 'default'
    const cached = sessionCache.get(cacheKey)

    if (cached && cached.expiresAt > Date.now()) {
      return cached
    }

    const session = await this.login(controller)
    sessionCache.set(cacheKey, session)
    return session
  }

  async authorizeClient(
    controller: OmadaController,
    request: OmadaAuthorizeClientRequest
  ): Promise<OmadaAuthorizeClientResponse> {
    try {
      const session = await this.getSession(controller)
      const baseUrl = buildBaseUrl(controller)
      const authUrl = `${baseUrl}/hotspot/extPortal/auth`
      const tunnelUrl = controller.controller_url || ''

      // time = expiration timestamp in milliseconds
      const expireTimeMs = Date.now() + request.duration * 1000

      // Site name must match exactly what's in the controller
      const siteName = ENV.OMADA_SITE_NAME || 'AASAM SITE'

      const authPayload = {
        clientMac: request.clientMac,
        apMac: (request as any).apMac || '',
        ssidName: (request as any).ssidName || '',
        radioId: (request as any).radioId ?? '0',
        site: siteName,
        time: expireTimeMs,
        authType: 4
      }

      console.log(JSON.stringify({
        level: 'info', event: 'OMADA_AUTH_REQUEST',
        clientMac: request.clientMac,
        site: siteName,
        expireTimeMs,
        durationSeconds: request.duration
      }))

      const res = await omadaFetch(authUrl, {
        method: 'POST',
        cookie: session.sessionCookie,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Csrf-Token': session.csrfToken
        } as any,
        body: JSON.stringify(authPayload)
      }, tunnelUrl)

      const text = await res.text()
      let body: any
      try { body = JSON.parse(text) } catch {
        throw new Error(`Omada auth non-JSON response: ${text.slice(0, 200)}`)
      }

      if (body.errorCode !== 0) {
        // Token expired → retry once with fresh login
        if (body.errorCode === -1000 || body.errorCode === -1 || body.errorCode === 401) {
          console.log(JSON.stringify({ level: 'info', event: 'OMADA_TOKEN_EXPIRED_RETRY' }))
          sessionCache.delete(controller.id || 'default')
          const freshSession = await this.getSession(controller)

          const retryRes = await omadaFetch(authUrl, {
            method: 'POST',
            cookie: freshSession.sessionCookie,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Csrf-Token': freshSession.csrfToken
            } as any,
            body: JSON.stringify(authPayload)
          })
          const retryText = await retryRes.text()
          const retryBody = JSON.parse(retryText)

          if (retryBody.errorCode !== 0) {
            throw new Error(`Omada auth failed after retry: errorCode=${retryBody.errorCode} msg=${retryBody.msg}`)
          }

          console.log(JSON.stringify({ level: 'info', event: 'OMADA_AUTH_OK_RETRY', clientMac: request.clientMac }))
          return {
            success: true,
            clientMac: request.clientMac,
            authorizedUntil: new Date(expireTimeMs).toISOString()
          }
        }

        throw new Error(`Omada auth failed: errorCode=${body.errorCode} msg=${body.msg}`)
      }

      console.log(JSON.stringify({
        level: 'info', event: 'OMADA_AUTH_OK',
        clientMac: request.clientMac,
        authorizedUntil: new Date(expireTimeMs).toISOString()
      }))

      return {
        success: true,
        clientMac: request.clientMac,
        authorizedUntil: new Date(expireTimeMs).toISOString()
      }

    } catch (error) {
      logError(error, 'Omada authorizeClient')
      return {
        success: false,
        clientMac: request.clientMac,
        error: error instanceof Error ? error.message : 'Omada authorization failed'
      }
    }
  }

  async revokeClient(
    controller: OmadaController,
    clientMac: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const session = await this.getSession(controller)
      const baseUrl = buildBaseUrl(controller)
      const tunnelUrl = controller.controller_url || ''

      // Revoke by authorizing with time = 0 (or current time = immediate expiry)
      const authUrl = `${baseUrl}/hotspot/extPortal/auth`
      const res = await omadaFetch(authUrl, {
        method: 'POST',
        cookie: session.sessionCookie,
        headers: {
          'Content-Type': 'application/json',
          'Csrf-Token': session.csrfToken
        } as any,
        body: JSON.stringify({
          clientMac,
          site: ENV.OMADA_SITE_NAME || 'AASAM SITE',
          time: Date.now(),   // expire immediately
          authType: 4
        })
      }, tunnelUrl)

      const body = await res.json()
      return { success: body.errorCode === 0 }

    } catch (error) {
      logError(error, 'Omada revokeClient')
      return { success: false, error: error instanceof Error ? error.message : 'Revoke failed' }
    }
  }

  async testConnection(controller: OmadaController): Promise<{ success: boolean; error?: string }> {
    try {
      await this.login(controller)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      }
    }
  }
}

// ── Mock Implementation ────────────────────────────────────────────────────────

class MockOmadaService implements IOmadaService {
  async authorizeClient(_: OmadaController, request: OmadaAuthorizeClientRequest): Promise<OmadaAuthorizeClientResponse> {
    devLog('MockOmada: authorizeClient', request.clientMac, request.duration + 's')
    await new Promise(r => setTimeout(r, 200))
    return {
      success: true,
      clientMac: request.clientMac,
      authorizedUntil: new Date(Date.now() + request.duration * 1000).toISOString()
    }
  }

  async revokeClient(_: OmadaController, clientMac: string) {
    devLog('MockOmada: revokeClient', clientMac)
    return { success: true }
  }

  async testConnection() {
    return { success: true }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createOmadaService(): IOmadaService {
  return ENV.MOCK_OMADA ? new MockOmadaService() : new RealOmadaService()
}

export const omadaService = createOmadaService()
