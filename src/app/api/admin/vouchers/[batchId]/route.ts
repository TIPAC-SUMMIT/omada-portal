import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function DELETE(request: NextRequest, { params }: { params: { batchId: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role === 'VIEWER') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const { count } = await supabaseAdmin.from('vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', params.batchId).eq('is_used', true)

    if ((count ?? 0) > 0) {
      return Response.json(apiError(`Cannot delete: ${count} vouchers already used`), { status: HTTP_STATUS.CONFLICT })
    }

    await supabaseAdmin.from('vouchers').delete().eq('batch_id', params.batchId)
    await supabaseAdmin.from('voucher_batches').delete().eq('id', params.batchId)
    return Response.json(apiSuccess({ deleted: true }))
  } catch (e) {
    logError(e, 'DELETE /admin/vouchers/[batchId]')
    return Response.json(apiError('Failed to delete batch'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
