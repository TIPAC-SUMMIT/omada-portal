import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest, { params }: { params: { batchId: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const { data, error } = await supabaseAdmin
      .from('vouchers')
      .select('id, code, is_used, used_at, created_at')
      .eq('batch_id', params.batchId)
      .order('created_at')

    if (error) throw error
    return Response.json(apiSuccess(data))
  } catch (e) {
    logError(e, 'GET /admin/vouchers/[batchId]/list')
    return Response.json(apiError('Failed to load vouchers'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
