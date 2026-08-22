import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const { transaction_id, site_id, price_tzs } = await request.json()

    if (!price_tzs) {
      return Response.json(apiError('price_tzs required'), { status: HTTP_STATUS.BAD_REQUEST })
    }

    // Find an unused voucher matching price (prefer site-specific, fallback to any)
    let query = supabaseAdmin
      .from('vouchers')
      .select('*')
      .eq('price_tzs', price_tzs)
      .eq('is_used', false)
      .order('created_at')
      .limit(1)

    if (site_id) query = query.eq('site_id', site_id)

    let { data: vouchers } = await query

    // If no site-specific voucher, try any site
    if (!vouchers?.length && site_id) {
      const { data: fallback } = await supabaseAdmin
        .from('vouchers')
        .select('*')
        .eq('price_tzs', price_tzs)
        .eq('is_used', false)
        .order('created_at')
        .limit(1)
      vouchers = fallback
    }

    if (!vouchers?.length) {
      return Response.json(apiError('No vouchers available for this package', 'NO_VOUCHERS'), {
        status: HTTP_STATUS.SERVICE_UNAVAILABLE
      })
    }

    const voucher = vouchers[0]

    // Atomic claim
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('vouchers')
      .update({ is_used: true, used_at: new Date().toISOString(), transaction_id })
      .eq('id', voucher.id)
      .eq('is_used', false)
      .select('*').single()

    if (claimErr || !claimed) {
      return Response.json(apiError('Failed to claim voucher — try again', 'CLAIM_FAILED'), {
        status: HTTP_STATUS.CONFLICT
      })
    }

    // Update batch used_count
    const { data: batch } = await supabaseAdmin
      .from('voucher_batches').select('used_count').eq('id', claimed.batch_id).single()
    if (batch) {
      await supabaseAdmin.from('voucher_batches')
        .update({ used_count: batch.used_count + 1 }).eq('id', claimed.batch_id)
    }

    return Response.json(apiSuccess({ code: claimed.code, duration_seconds: claimed.duration_seconds }))
  } catch (e) {
    logError(e, 'POST /admin/vouchers/assign')
    return Response.json(apiError('Failed to assign voucher'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
