import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { apiError, apiSuccess, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
  }

  try {
    const { data: transactions, error } = await supabaseAdmin
      .from('payment_transactions')
      .select('reference')
      .in('status', ['PENDING', 'PAYMENT_INITIATED'])
      .not('malipopay_transaction_id', 'is', null)
      .lt('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) throw error

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured')

    const results = await Promise.allSettled((transactions ?? []).map(async ({ reference }) => {
      const response = await fetch(`${appUrl.replace(/\/$/, '')}/api/payment/status/${encodeURIComponent(reference)}`, {
        headers: { 'x-reconciliation-job': 'cron' },
        cache: 'no-store'
      })
      return { reference, status: response.status }
    }))

    const processed = results.filter(result => result.status === 'fulfilled').length
    const failed = results.length - processed
    return Response.json(apiSuccess({ scanned: results.length, processed, failed }))
  } catch (error) {
    logError(error, 'Payment reconciliation cron')
    return Response.json(apiError('Reconciliation failed'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
