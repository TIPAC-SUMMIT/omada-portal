/**
 * POST /api/admin/auth/logout
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)

    if (admin) {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'ADMIN_LOGOUT',
        admin_id: admin.sub,
        ip_address: request.headers.get('x-forwarded-for') || request.ip || null
      })
    }

    const response = Response.json(apiSuccess({ message: 'Logged out' }))
    response.headers.set(
      'Set-Cookie',
      'admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0'
    )
    return response

  } catch (error) {
    logError(error, 'Admin logout')
    return Response.json(apiError('Logout failed'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
