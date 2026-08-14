/**
 * GET /api/admin/auth/me
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)

    if (!admin) {
      return Response.json(apiError('Unauthorized', 'UNAUTHORIZED'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // Return live data (not just JWT payload)
    const { data: adminRecord } = await supabaseAdmin
      .from('admins')
      .select('id, email, name, role, is_active, last_login_at, created_at')
      .eq('id', admin.sub)
      .single()

    if (!adminRecord || !adminRecord.is_active) {
      return Response.json(apiError('Account inactive', 'INACTIVE'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    return Response.json(apiSuccess({
      id: adminRecord.id,
      email: adminRecord.email,
      name: adminRecord.name,
      role: adminRecord.role,
      lastLoginAt: adminRecord.last_login_at,
      sites: admin.sites ?? []
    }))

  } catch (error) {
    logError(error, 'Admin me')
    return Response.json(apiError('Failed to fetch profile'), {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })
  }
}
