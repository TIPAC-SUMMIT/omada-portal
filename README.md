# Omada Captive Portal — Wi-Fi Payment Platform

A production-grade captive portal that lets Wi-Fi guests purchase internet access using Tanzanian mobile money (M-Pesa, Tigo Pesa, Airtel Money, Halopesa) via MalipoPay. Supports multiple physical sites from one central dashboard.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Variables](#environment-variables)
5. [Supabase Setup](#supabase-setup)
6. [Database Migration](#database-migration)
7. [Local Development](#local-development)
8. [Testing](#testing)
9. [MalipoPay Configuration](#malipopay-configuration)
10. [Omada Controller Configuration](#omada-controller-configuration)
11. [Webhook Testing](#webhook-testing)
12. [Vercel Deployment](#vercel-deployment)
13. [Production Checklist](#production-checklist)
14. [Missing API Documentation](#missing-api-documentation)

---

## Architecture Overview

```
Guest Wi-Fi
    │
    ▼
Omada Controller (captive portal redirect)
    │
    ▼  HTTPS
Central Next.js App (Vercel)
    │
    ├── /guest/login        ← Omada redirects here
    ├── /guest/packages     ← Package selection
    ├── /guest/payment      ← STK Push status polling
    │
    ├── /api/portal/*       ← Session management
    ├── /api/payment/*      ← MalipoPay integration
    ├── /api/malipopay/callback  ← Webhook receiver
    │
    ├── /admin/*            ← Dashboard (SUPER_ADMIN / SITE_ADMIN / VIEWER)
    └── /api/admin/*        ← Admin API (JWT protected)
         │
    Supabase (PostgreSQL)
         │
    ├── Sites / Controllers / APs
    ├── Packages / Site-Packages
    ├── Portal Sessions
    ├── Payment Transactions  ← Idempotent state machine
    ├── Client Authorizations
    └── Audit Logs
```

**Payment flow:**
```
Guest selects package → enters phone → POST /api/payment/create
→ MalipoPay STK Push → customer enters PIN
→ MalipoPay calls POST /api/malipopay/callback
→ Server validates + authorizes MAC via Omada API
→ Frontend polls GET /api/payment/status/:ref → shows success
→ Redirect to Omada original URL
```

---

## Prerequisites

- Node.js 18+
- npm 9+
- Supabase account (free tier works)
- MalipoPay merchant account
- TP-Link Omada Controller (v5.x recommended)
- Vercel account (for deployment)

---

## Installation

```bash
git clone <repo>
cd omada-portal
npm install
cp .env.example .env.local
# Edit .env.local with your values
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (**never expose to browser**) |
| `MALIPOPAY_API_TOKEN` | MalipoPay API token (**server only**) |
| `MALIPOPAY_BASE_URL` | MalipoPay base URL (default: `https://core-prod.malipopay.co.tz/api/v1`) |
| `MALIPOPAY_WEBHOOK_SECRET` | Webhook HMAC secret (if MalipoPay provides one) |
| `NEXT_PUBLIC_APP_URL` | Public URL of this app |
| `PORTAL_SESSION_SECRET` | Random 32+ char secret for session tokens |
| `ADMIN_JWT_SECRET` | Random 32+ char secret for admin JWTs |
| `MOCK_PAYMENTS` | `true` to use mock payment mode in dev |
| `MOCK_OMADA` | `true` to use mock Omada in dev |

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Database Migration

Run migrations in Supabase SQL editor (**Settings → SQL Editor**):

1. Paste and run `supabase/migrations/001_initial_schema.sql`
2. Paste and run `supabase/migrations/002_transaction_constraints.sql`
3. Paste and run `supabase/migrations/003_vouchers.sql`
4. Paste and run `supabase/migrations/004_omada_vouchers.sql`

Or use the migration script (requires `SUPABASE_SERVICE_ROLE_KEY`):
```bash
npm run db:migrate
```

Migration `004_omada_vouchers.sql` is required for the live payment flow. It adds
`voucher_code`, `omada_voucher_group_id`, and `portal_auth_url`. It is additive
and safe to run after the earlier migrations.

**Create first admin user:**
```sql
INSERT INTO admins (email, password_hash, name, role)
VALUES (
  'admin@yourcompany.com',
  -- Generate hash: node -e "const b=require('bcryptjs'); b.hash('yourpassword',10).then(console.log)"
  '$2b$10$YOUR_BCRYPT_HASH_HERE',
  'Super Admin',
  'SUPER_ADMIN'
);
```

---

## Local Development

```bash
npm run dev
```

App runs at `http://localhost:3000`

- Admin panel: `http://localhost:3000/admin/login`
- Guest portal: `http://localhost:3000/guest/login?clientMac=AA:BB:CC:DD:EE:FF&apMac=11:22:33:44:55:66&ssidName=TestWiFi`

**Mock mode** (no real payments or Omada calls):
```env
MOCK_PAYMENTS=true
MOCK_OMADA=true
```

In mock mode, the MalipoPay service automatically triggers a webhook ~5 seconds after payment initiation with 90% success rate.

---

## Testing

```bash
npm test                 # run all tests
npm run test:watch       # watch mode
npm run test:coverage    # coverage report
```

Test files are in `src/tests/`. Critical test coverage:
- `utils.test.ts` — phone validation, MAC normalization, reference generation, session hashing
- `webhook.test.ts` — idempotency logic, status mapping
- `validation.test.ts` — Zod schema validation for all API inputs

---

## MalipoPay Configuration

1. Obtain API token from MalipoPay merchant dashboard
2. Set `MALIPOPAY_API_TOKEN` in environment
3. Configure webhook URL in MalipoPay dashboard:
   ```
   https://your-domain.vercel.app/api/malipopay/callback
   ```
4. If MalipoPay provides a webhook signing secret, set `MALIPOPAY_WEBHOOK_SECRET`

---

## Omada External Portal Configuration

Configure the Omada site/SSID captive portal to use the deployed application:

1. Set the external portal URL to:
   ```
   https://your-domain.vercel.app/guest/login
   ```
2. Enable external portal authentication for the SSID.
3. Ensure Omada appends the client parameters `clientMac`, `apMac`,
   `ssidName`, `radioId`, `vid`, `redirectUrl`, and `tp`.
4. The `tp` parameter must be the Omada portal authentication POST URL. The
   application stores it in Supabase and posts the voucher to that URL after
   payment.
5. Set the Vercel environment variables:
   ```
   OMADA_API_URL=https://euw1-omada-northbound.tplinkcloud.com
   OMADA_CLIENT_ID=...
   OMADA_CLIENT_SECRET=...
   OMADA_OMADAC_ID=...
   OMADA_SITE_ID=6a9022acd869a50d314e27cd
   ```

The successful flow is: Omada redirects the client to `/guest/login`, Supabase
stores the captive-portal context, MalipoPay confirms the payment, the server
creates a one-use Omada voucher through the Northbound API, and the client
submits that voucher to the stored `tp` endpoint. Vercel must be able to reach
both Supabase and the Omada Northbound API; the client device must be able to
reach the Omada portal authentication endpoint.

**⚠️ Missing documentation needed:**
- Exact webhook payload structure (field names, status values)
- Whether MalipoPay signs webhooks (HMAC header name and format)
- Payment status check endpoint (if available)

See `src/lib/services/malipopay.ts` for `parseWebhook()` — update to match actual payload.

---

## Omada Controller Configuration

### Step 1: Configure Omada Captive Portal

In Omada Controller → SSID → Portal Settings:
- Portal type: **External Web Portal**
- Authentication URL: `https://your-domain.vercel.app/guest/login`
- Include parameters: `clientMac`, `apMac`, `ssidName`, `radioId`, `vid`, `redirectUrl`

### Step 2: Add controller in admin dashboard

1. Go to **Admin → Sites** → create a site
2. The Omada controller API credentials are stored per-site in the database

### Step 3: Implement Omada API

The `src/lib/services/omada.ts` file contains a stub (`RealOmadaService`) that needs:
- Omada Controller version (v5.x or Cloud)
- Authentication endpoint and method
- Client authorization endpoint and payload format
- Whether controller is on public internet or private LAN

**If controller is on private LAN:**
Set `use_site_connector = true` on the controller record. A site connector agent (to be built) runs on the local network and proxies API calls.

**⚠️ Missing documentation needed:**
- Exact Omada OpenAPI authentication flow
- `authorizeClient` endpoint URL and body format
- Duration field unit (seconds or minutes)
- Whether Omada supports explicit expiration time

---

## Webhook Testing

Use [ngrok](https://ngrok.com) to expose localhost for webhook testing:

```bash
ngrok http 3000
# Use the https:// URL as NEXT_PUBLIC_APP_URL and in MalipoPay webhook config
```

Test webhook manually:
```bash
curl -X POST https://your-ngrok-url/api/malipopay/callback \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "WIFI-20260812-ABCD1234",
    "status": "SUCCESS",
    "transactionId": "mp_test_123",
    "amount": 1000,
    "phoneNumber": "255744123456"
  }'
```

---

## Vercel Deployment

### Deploy

```bash
npm install -g vercel
vercel --prod
```

Or connect GitHub repo in Vercel dashboard for automatic deploys.

### Environment Variables in Vercel

Add all variables from `.env.example` in **Vercel → Project → Settings → Environment Variables**.

### Important Vercel Considerations

| Concern | Notes |
|---|---|
| **Serverless functions** | All API routes run as serverless functions. No persistent state — all state is in Supabase. ✅ |
| **Webhook delivery** | Vercel functions have a 10-30s timeout. MalipoPay webhook will complete within that. ✅ |
| **Database connections** | Supabase JS client works in serverless. Connection pooling is handled by Supabase. ✅ |
| **Omada controller (private LAN)** | Vercel cannot reach a private LAN controller directly. Requires site connector agent. ⚠️ |
| **Background jobs** | Session expiry is checked on-demand (no background job needed for MVP). ✅ |
| **Rate limiting** | In-memory rate limiter in middleware resets per function instance. Use Redis (`REDIS_URL`) for production multi-instance. ⚠️ |

### Private Omada Controller Architecture

If your controller is on a private LAN:
```
Vercel (API)
    │ HTTPS
    ▼
Site Connector Agent (runs on local server/Raspberry Pi at venue)
    │ local network
    ▼
Omada Controller (private LAN: 192.168.x.x)
```

Set `use_site_connector = true` and `site_connector_url` on the controller record. The agent is a simple Express/Node app that forwards requests from Vercel to the local Omada controller.

---

## Production Checklist

### Security
- [ ] All secrets set in Vercel environment variables (not in code)
- [ ] `MOCK_PAYMENTS=false`
- [ ] `MOCK_OMADA=false`
- [ ] `MALIPOPAY_WEBHOOK_SECRET` set (once MalipoPay provides signing)
- [ ] Admin passwords are strong bcrypt hashes
- [ ] `NEXT_PUBLIC_APP_URL` set to production domain
- [ ] Supabase RLS enabled on all tables ✅ (done in migration)

### Functionality
- [ ] Supabase migrations run
- [ ] Default packages seeded or created via admin dashboard
- [ ] At least one site created and active
- [ ] Site packages assigned
- [ ] MalipoPay webhook URL configured in MalipoPay dashboard
- [ ] Omada portal redirect URL configured in Omada controller
- [ ] Omada controller credentials configured (or mock mode for testing)
- [ ] End-to-end test: connect to Wi-Fi → select package → pay → internet access

### Monitoring
- [ ] Vercel function logs monitored
- [ ] Supabase dashboard for database monitoring
- [ ] Audit logs reviewed periodically in admin dashboard

---

## Missing API Documentation

The following items require additional information to complete the real integrations:

### MalipoPay
1. **Webhook payload structure** — exact field names and format of the callback POST body
2. **Webhook authentication** — HMAC signature header name and verification method
3. **Payment status values** — complete list of status strings returned in webhook
4. **Status check endpoint** — URL and format for polling payment status (if available)

### Omada Controller
1. **Controller version** — v5.x local, or Omada Cloud
2. **Authentication** — login endpoint, credentials format, session/token handling
3. **Client authorization endpoint** — URL path, HTTP method, body format
4. **Duration format** — seconds or minutes for authorization timeout
5. **Omada site identifier** — how sites/SSIDs are identified in API calls

Once you provide this documentation, update:
- `src/lib/services/malipopay.ts` → `parseWebhook()` and `verifyWebhook()`
- `src/lib/services/omada.ts` → `authenticate()` and `authorizeClient()`
