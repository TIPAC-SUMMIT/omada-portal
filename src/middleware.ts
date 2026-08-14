import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/auth'

// In-memory rate limiter (per-process; use Redis for multi-instance)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= maxRequests) return false
  entry.count++
  return true
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of rateLimitStore.entries()) {
    if (val.resetAt < now) rateLimitStore.delete(key)
  }
}, 300_000)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  // ── Security headers ───────────────────────────────────────────────────────
  const res = NextResponse.next()
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // ── Rate limiting ──────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/admin/auth/login')) {
    if (!rateLimit(`login:${ip}`, 5, 300_000)) {
      return new NextResponse(JSON.stringify({ success: false, error: 'Too many login attempts' }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '300' }
      })
    }
  }

  if (pathname.startsWith('/api/payment/create')) {
    if (!rateLimit(`payment:${ip}`, 3, 60_000)) {
      return new NextResponse(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
        status: 429, headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  if (pathname.startsWith('/api/portal/session')) {
    if (!rateLimit(`portal:${ip}`, 10, 60_000)) {
      return new NextResponse(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
        status: 429, headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  if (pathname.startsWith('/api/payment/status')) {
    if (!rateLimit(`status:${ip}`, 60, 60_000)) {
      return new NextResponse(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
        status: 429, headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // ── Admin route protection ─────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    // For page routes, check cookie; API routes handle their own JWT verification
    const token = request.cookies.get('admin_token')?.value
    if (!token) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }

    const payload = await verifyAdminToken(token)
    if (!payload) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }

  return res
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/payment/:path*',
    '/api/portal/:path*',
    '/api/malipopay/:path*',
  ]
}
