/**
 * POST /api/admin/auth/login
 */

import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminLoginSchema } from '@/lib/validation'
import { supabaseAdmin } from '@/lib/supabase'
import { signAdminToken } from '@/lib/auth'
import { apiSuccess, apiError, validateRequestBody, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateRequestBody(adminLoginSchema)(body)

    // Fetch admin by email
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('id, email, name, role, is_active, password_hash')
      .eq('email', data.email.toLowerCase().trim())
      .single()

    // Use constant-time comparison style — don't reveal whether email exists
    const dummyHash = '$2b$10$invalidhashfortimingnormalisation000000000000000000000'
    const hashToCheck = admin?.password_hash ?? dummyHash

    const passwordValid = await bcrypt.compare(data.password, hashToCheck)

    if (!admin || !passwordValid || !admin.is_active) {
      return Response.json(apiError('Invalid email or password', 'INVALID_CREDENTIALS'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // Fetch site assignments for SITE_ADMIN
    let sites: string[] = []
    if (admin.role === 'SITE_ADMIN') {
      const { data: adminSites } = await supabaseAdmin
        .from('admin_sites')
        .select('site_id')
        .eq('admin_id', admin.id)

      sites = adminSites?.map(s => s.site_id) ?? []
    }

    const token = await signAdminToken({
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      ...(sites.length > 0 && { sites })
    })

    // Update last_login_at
    await supabaseAdmin
      .from('admins')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id)

    // Audit log
    const clientIp = request.headers.get('x-forwarded-for') || request.ip || null
    await supabaseAdmin.from('audit_logs').insert({
      action: 'ADMIN_LOGIN',
      admin_id: admin.id,
      details: { email: admin.email },
      ip_address: clientIp,
      user_agent: request.headers.get('user-agent')
    })

    const response = Response.json(apiSuccess({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role }
    }))

    // Also set HttpOnly cookie for browser clients
    response.headers.set(
      'Set-Cookie',
      `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=28800`
    )

    return response

  } catch (error) {
    logError(error, 'Admin login')

    if (error instanceof Error && error.message.includes('Validation failed')) {
      return Response.json(apiError(error.message, 'VALIDATION_ERROR'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return Response.json(apiError('Login failed'), {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })
  }
}
