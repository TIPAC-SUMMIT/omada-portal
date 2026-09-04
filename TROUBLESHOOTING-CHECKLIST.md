# Omada Portal Troubleshooting Checklist

Use this checklist to track fixes and testing. Mark an item `[x]` only after
the code change and its targeted test have been completed.

## Priority 1: Payment and Omada correctness

- [ ] Create one shared authorization-finalization service for the webhook,
  payment polling, and admin retry paths.
- [ ] Make voucher creation fully idempotent so retries cannot create duplicate
  Omada voucher groups.
- [ ] Run a real 7-minute authorization test and confirm Omada receives
  `time: 420000` and expires access approximately seven minutes after start.
- [ ] Validate Omada API response shapes strictly for tokens, sites, voucher
  groups, voucher details, and controller login.
- [ ] Persist sanitized Omada response data in `client_authorizations.omada_response`.
- [ ] Add limited retries for transient Omada network and 5xx failures without
  blindly retrying voucher creation.

## Priority 2: Multi-site support

- [ ] Decide whether all sites share one Omada controller or require
  per-site controller configuration.
- [ ] If required, add secure per-site controller configuration and use it for
  both voucher creation and client authorization.
- [ ] Use the canonical database Omada site ID consistently instead of relying
  on mutable site names.
- [ ] Add pagination to Omada site listing.
- [ ] Confirm the selected site is used by both voucher creation and client
  authorization.

## Priority 3: Middleware and API security

- [ ] Fix middleware rate-limit placement so normal admin APIs are limited.
- [ ] Fix middleware rate-limit placement so the MalipoPay webhook is limited.
- [ ] Add payment limits by portal session and phone number in addition to IP.
- [ ] Add limits for voucher and admin authorization retries.
- [ ] Replace in-memory production rate limiting with Redis or another
  distributed limiter.
- [ ] Validate `portalAuthUrl` / `tp` against an approved Omada destination.
- [ ] Prevent site and portal context parameters from being changed during the
  payment flow.
- [ ] Safely construct the admin transaction search filter.
- [ ] Remove the known fallback admin JWT secret in production.
- [ ] Add explicit production environment-variable validation.

## Priority 4: Payment reliability

- [ ] Centralize and validate all payment state transitions.
- [ ] Check every Supabase mutation result in payment and authorization flows.
- [ ] Prevent webhook, polling, cron, and admin retry from authorizing the same
  transaction concurrently.
- [ ] Make cron reconciliation count only successful HTTP responses as
  processed.
- [ ] Verify provider reference, customer reference, amount, paid amount, and
  phone number when available.

## Priority 5: Portal and user flow

- [ ] Prevent unnecessary duplicate portal sessions for the same client and
  site context.
- [ ] Test preservation of all Omada parameters through every redirect:
  `clientMac`, `apMac`, `ssidName`, `site`, `t`, `gatewayMac`, `radioId`,
  `vid`, `originUrl`, `redirectUrl`, and `tp`.
- [ ] Define fallbacks for missing Omada `site` or `radioId` values.
- [ ] Revalidate package status, site assignment, price, and duration at
  payment creation time.
- [ ] Keep detailed provider/controller errors in logs while showing stable
  Swahili messages to guests.

## Priority 6: Database and lifecycle

- [ ] Add expiration processing for active `client_authorizations`.
- [ ] Keep transaction and authorization statuses synchronized.
- [ ] Add constraints ensuring authorization duration is positive and expiry is
  after authorization time.
- [ ] Add indexes for active client, site/status, and provider-reference
  queries where needed.
- [ ] Remove stale schema and documentation references.

## Priority 7: Testing and observability

- [ ] Add Omada request tests for token, voucher, controller login, cookies,
  CSRF, headers, paths, and payloads.
- [ ] Add integration tests for webhook, polling, cron, and admin retry
  authorization paths.
- [ ] Add negative tests for invalid responses, expired tokens, missing cookies,
  invalid CSRF, wrong site, amount mismatch, duplicates, and missing context.
- [ ] Add consistent structured Omada logs with request, transaction, site, and
  voucher identifiers.
- [ ] Ensure logs never contain credentials, tokens, signatures, or unmasked
  phone numbers.
- [ ] Add an admin-only integration health-check endpoint.

## Recommended execution order

1. Middleware rate-limit placement.
2. Shared Omada authorization-finalization service.
3. Route webhook, polling, and admin retry through the shared service.
4. Supabase mutation error handling.
5. Live 7-minute Omada duration test.
6. Per-site controller routing or documented single-controller limitation.
7. Omada and payment-flow tests.
8. URL handling, search filtering, and secret validation.
9. README and deployment documentation updates.
