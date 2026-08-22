import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    let query = supabaseAdmin
      .from('voucher_batches')
      .select('*, sites!voucher_batches_site_id_fkey(name)')
      .order('created_at', { ascending: false })

    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) {
      query = query.in('site_id', admin.sites)
    }

    const { data, error } = await query
    if (error) throw error
    return Response.json(apiSuccess(data ?? []))
  } catch (e) {
    logError(e, 'GET /admin/vouchers')
    return Response.json(apiError('Failed to load vouchers'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role === 'VIEWER') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const body = await request.json()
    const { site_id, name, price_tzs, duration_seconds, codes } = body

    if (!name || !price_tzs || !duration_seconds || !codes?.length) {
      return Response.json(apiError('name, price_tzs, duration_seconds and codes are required'), { status: HTTP_STATUS.BAD_REQUEST })
    }

    const validPrices = [200, 500, 1000]
    if (!validPrices.includes(price_tzs)) {
      return Response.json(apiError('Price must be 200, 500 or 1000 TZS'), { status: HTTP_STATUS.BAD_REQUEST })
    }

    const cleanCodes: string[] = [...new Set(
      (codes as string[]).map((c) => c.trim()).filter((c) => c.length > 0)
    )]

    if (cleanCodes.length === 0) {
      return Response.json(apiError('No valid codes provided'), { status: HTTP_STATUS.BAD_REQUEST })
    }

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from('voucher_batches')
      .insert({
        site_id: site_id || null,
        name,
        price_tzs,
        duration_seconds,
        total_count: cleanCodes.length,
        used_count: 0,
        created_by: admin.sub
      })
      .select('*').single()

    if (batchErr) throw batchErr

    const vouchers = cleanCodes.map((code) => ({
      batch_id: batch.id,
      site_id: site_id || null,
      code,
      price_tzs,
      duration_seconds,
      is_used: false
    }))

    const { error: vErr } = await supabaseAdmin.from('vouchers').insert(vouchers)
    if (vErr) {
      await supabaseAdmin.from('voucher_batches').delete().eq('id', batch.id)
      throw vErr
    }

    return Response.json(apiSuccess({ ...batch, inserted: cleanCodes.length }), { status: HTTP_STATUS.CREATED })
  } catch (e: any) {
    logError(e, 'POST /admin/vouchers')
    if (e?.code === '23505') return Response.json(apiError('Some voucher codes already exist for this site'), { status: HTTP_STATUS.CONFLICT })
    return Response.json(apiError('Failed to create voucher batch'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
