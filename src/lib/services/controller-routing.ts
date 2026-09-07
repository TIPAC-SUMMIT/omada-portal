/**
 * Controller and access point routing helpers
 * Resolves which controller and AP should handle a portal session/payment
 */

import { supabaseAdmin } from '@/lib/supabase'
import type { OmadaController, AccessPoint, Site } from '@/lib/types'

/**
 * Resolve the AP (access point) by MAC address
 * Returns the AP and its associated controller
 */
export async function resolveAccessPointByMac(
  apMac: string,
  siteId?: string
): Promise<{ ap: AccessPoint; controller: OmadaController } | null> {
  const compact = apMac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase()
  if (compact.length !== 12) {
    return null
  }
  const normalized = compact.match(/.{2}/g)!.join(':')

  let query = supabaseAdmin
    .from('access_points')
    .select(`
      *,
      omada_controllers:controller_id (*)
    `)
    .eq('ap_mac', normalized)
    .eq('is_active', true)

  if (siteId) {
    query = query.eq('site_id', siteId)
  }

  const { data: results } = await query

  if (!results || results.length === 0) return null

  // If multiple APs with same MAC in different sites (shouldn't happen),
  // prefer the one with a controller configured
  const result = results.find((r: any) => r.omada_controllers)
    || results[0]

  if (!result?.omada_controllers) return null

  return {
    ap: result as AccessPoint,
    controller: result.omada_controllers as OmadaController
  }
}

/**
 * Resolve the site and its primary controller
 * Used when AP MAC cannot be resolved
 */
export async function resolveSitePrimaryController(
  siteIdentifier: string  // name or omada_site_id
): Promise<{ site: Site; controller: OmadaController } | null> {
  // Try to find by name first
  let { data: site } = await supabaseAdmin
    .from('sites')
    .select(`
      *,
      omada_controllers:primary_controller_id (*)
    `)
    .eq('name', siteIdentifier)
    .eq('status', 'ACTIVE')
    .single()

  if (!site) {
    // Try by omada_site_id
    const { data: siteBySiteId } = await supabaseAdmin
      .from('sites')
      .select(`
        *,
        omada_controllers:primary_controller_id (*)
      `)
      .eq('omada_site_id', siteIdentifier)
      .eq('status', 'ACTIVE')
      .single()

    site = siteBySiteId
  }

  if (!site) return null

  // If there's a primary_controller_id, use it
  if (site.omada_controllers) {
    return {
      site: site as Site,
      controller: site.omada_controllers as OmadaController
    }
  }

  // Fallback: get the first active controller for this site
  const { data: controllers } = await supabaseAdmin
    .from('omada_controllers')
    .select('*')
    .eq('site_id', site.id)
    .eq('is_active', true)
    .limit(1)

  if (!controllers || controllers.length === 0) return null

  return {
    site: site as Site,
    controller: controllers[0] as OmadaController
  }
}

/**
 * Resolve controller and AP for a portal session
 * 
 * Strategy:
 * 1. Try to find AP by MAC address (most specific)
 * 2. Fall back to site resolution by name/omada_site_id
 * 3. Reject if ambiguous or unconfigured
 */
export async function resolveSessionController(opts: {
  apMac: string
  siteIdentifier?: string
  clientMac?: string
}): Promise<{
  ap: AccessPoint | null
  controller: OmadaController
  site: Site
  ambiguous: boolean
  error?: string
}> {
  const { apMac, siteIdentifier, clientMac } = opts

  // Step 1: Try AP resolution first
  const apResult = await resolveAccessPointByMac(apMac, undefined)
  
  if (apResult) {
    // Found AP in some site — verify we can resolve the site context
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', apResult.ap.site_id)
      .single()

    if (site) {
      return {
        ap: apResult.ap,
        controller: apResult.controller,
        site: site as Site,
        ambiguous: false
      }
    }

    return {
      ap: null,
      controller: apResult.controller,
      site: {} as Site,
      ambiguous: false,
      error: 'AP found but associated site not configured'
    }
  }

  // Step 2: Try site resolution
  if (siteIdentifier) {
    const siteResult = await resolveSitePrimaryController(siteIdentifier)
    
    if (siteResult) {
      return {
        ap: null,
        controller: siteResult.controller,
        site: siteResult.site,
        ambiguous: false
      }
    }

    return {
      ap: null,
      controller: {} as OmadaController,
      site: {} as Site,
      ambiguous: false,
      error: `Site '${siteIdentifier}' not configured or has no controller`
    }
  }

  // Step 3: Try to find AP by site first if no site identifier provided
  const { data: apsInSite } = await supabaseAdmin
    .from('access_points')
    .select(`
      *,
      omada_controllers:controller_id (*),
      sites:site_id (*)
    `)
    .eq('ap_mac', apMac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().match(/.{2}/g)!.join(':'))
    .eq('is_active', true)

  if (apsInSite && apsInSite.length === 1) {
    const result = apsInSite[0] as any
    return {
      ap: result as AccessPoint,
      controller: result.omada_controllers as OmadaController,
      site: result.sites as Site,
      ambiguous: false
    }
  }

  if (apsInSite && apsInSite.length > 1) {
    return {
      ap: null,
      controller: {} as OmadaController,
      site: {} as Site,
      ambiguous: true,
      error: `Access point ${apMac} found in multiple sites; specify site parameter`
    }
  }

  return {
    ap: null,
    controller: {} as OmadaController,
    site: {} as Site,
    ambiguous: true,
    error: `Could not resolve controller for AP ${apMac}${siteIdentifier ? ` or site ${siteIdentifier}` : ''}`
  }
}

/**
 * Gets a controller's cloud API credentials
 * Decrypts encrypted fields for use in API calls
 */
export async function getControllerCloudApiConfig(
  controllerId: string
): Promise<{
  apiUrl: string
  clientId: string
  clientSecret: string
  omadacId: string
} | null> {
  const { data: controller } = await supabaseAdmin
    .from('omada_controllers')
    .select('*')
    .eq('id', controllerId)
    .single()

  if (!controller) return null

  if (!controller.cloud_api_url || !controller.cloud_api_client_id || 
      !controller.cloud_api_omadac_id) {
    return null
  }

  // Decrypt secret - caller must have encryption key loaded
  let clientSecret = ''
  if (controller.cloud_api_client_secret_ciphertext) {
    try {
      const { decryptCredential } = await import('../encryption')
      clientSecret = decryptCredential(controller.cloud_api_client_secret_ciphertext)
    } catch (error) {
      console.error('Failed to decrypt cloud API client secret:', error)
      return null
    }
  }

  return {
    apiUrl: controller.cloud_api_url,
    clientId: controller.cloud_api_client_id,
    clientSecret,
    omadacId: controller.cloud_api_omadac_id
  }
}

/**
 * Gets a controller's hotspot operator credentials
 * Decrypts encrypted fields for use in extPortal API calls
 */
export async function getControllerOperatorCredentials(
  controllerId: string
): Promise<{
  controllerUrl: string
  controllerId: string
  username: string
  password: string
} | null> {
  const { data: controller } = await supabaseAdmin
    .from('omada_controllers')
    .select('*')
    .eq('id', controllerId)
    .single()

  if (!controller) return null

  if (!controller.controller_url || !controller.controller_id) {
    return null
  }

  let username = ''
  let password = ''

  try {
    const { decryptCredential } = await import('../encryption')
    
    if (controller.controller_username_ciphertext) {
      username = decryptCredential(controller.controller_username_ciphertext)
    }
    if (controller.controller_password_ciphertext) {
      password = decryptCredential(controller.controller_password_ciphertext)
    }
  } catch (error) {
    console.error('Failed to decrypt controller credentials:', error)
    return null
  }

  if (!username || !password) {
    return null
  }

  return {
    controllerUrl: controller.controller_url,
    controllerId: controller.controller_id,
    username,
    password
  }
}
