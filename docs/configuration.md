# Configuration

OpenDealbook runs without any external integration configured, but each integration-backed
feature stays dark until its environment variables are set. This page lists what to configure,
keyed by the feature it unlocks. Names below are the actual variables referenced in the code.

## Core: Supabase

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public; **must be a build argument** so it is inlined into the browser bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public; **also a build argument**. If the image is built without real values, the browser auth UI throws |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side; used by service-role paths (seeders, webhooks, projectors' callers) |
| `TEAM_RENAME_LIMIT` | `monthly` (the default when unset) allows one team rename per 30 days; `off` removes the limit. Any other value stops the server at boot. The web app writes it to the database at boot and the database enforces it, so it also covers direct API calls. Super-admins are exempt |

Multi-factor recovery also needs a Postgres GUC, `app.mfa_recovery_pepper`, set in production
(it is the HMAC pepper for recovery codes).

## E-signature: Documenso (LOI / APA and lender forms)

Unlocks the document signature pipeline and the signature-driven stage transitions (see
[Offers, LOI and APA](offers-loi-apa.md)), and signature requests for the forms a lender
uploads to a lender room. A Word form is converted to PDF through Gotenberg first, at
`GOTENBERG_URL` (default `http://localhost:3009`).

| Variable | Notes |
| --- | --- |
| `DOCUMENSO_URL` | The Documenso instance URL. The Helm chart sets it to the in-cluster Service, `http://documenso.documenso.svc.cluster.local:3000` |
| `DOCUMENSO_API_KEY` | API token created in Documenso (Team settings, API Tokens) |
| `DOCUMENSO_WEBHOOK_SECRET` | The secret set on the Documenso webhook that points at `/api/webhooks/documenso`, at least 32 characters. Documenso sends it in the `X-Documenso-Secret` header. When it is unset or shorter the route refuses every webhook with 401 |

A webhook only tells the app which document changed. The app then asks Documenso for that
document's state with the API key and acts on the answer, so the API key must belong to the
same Documenso team as the webhook.

In a cluster, three steps stay manual and are done once, because Documenso v2.18 lets only a
signed-in browser session, not an API token, manage API tokens and webhooks:

1. Sign in to Documenso as the team that will own the documents, mint an API token, and store
   it in OpenBao `secret/home/opendealbook` as `DOCUMENSO_API_KEY`.
2. Generate a webhook secret, for example `openssl rand -hex 32`, and store it there as
   `DOCUMENSO_WEBHOOK_SECRET`.
3. In that same team's Documenso settings, create one webhook to
   `http://<fullname>-web.<namespace>.svc.cluster.local:3000/api/webhooks/documenso` (for a
   release `odb`, `http://odb-opendealbook-web.<namespace>.svc.cluster.local:3000/api/webhooks/documenso`),
   enabled, using that secret, for the events `DOCUMENT_SENT`, `DOCUMENT_COMPLETED`,
   `DOCUMENT_REJECTED`, `DOCUMENT_CANCELLED`, and `RECIPIENT_EXPIRED`. Documenso must be allowed
   to call that private host (`NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` on Documenso).

The ExternalSecret already loads every key under `secret/home/opendealbook` into the app, so
the two new keys need no chart change.

Also required to go live, beyond env: the LOI and APA **template language is user-provided**
(the seed ships placeholders only); the **signers** are named by the deal team for each LOI
and APA; and the rendered-output-to-signing **bucket handoff**
(`generated` to `contracts`) must be reconciled when activating.

## Mailbox and calendar: Nango

Unlocks send-as-user cold outreach (see
[Outreach and notifications](outreach-and-notifications.md)) and per-participant meeting
calendar push (see [Due diligence](due-diligence.md)).

| Variable | Unlocks |
| --- | --- |
| `NANGO_SECRET_KEY` | Nango server credential |
| `NANGO_HOST` / `NANGO_SERVER_URL` | Nango host |
| `NANGO_GMAIL_INTEGRATION_ID` | Gmail mailbox send |
| `NANGO_MICROSOFT_INTEGRATION_ID` | Microsoft 365 mailbox send |
| `NANGO_GOOGLE_CALENDAR_INTEGRATION_ID` | Google Calendar push |
| `NANGO_MICROSOFT_CALENDAR_INTEGRATION_ID` | Microsoft calendar push |

The Nango dashboard integrations are the operator's to set up. The code is wired but dark
until the matching integration id is configured.

## Document extraction and verification: Docling plus an LLM

Unlocks document verification and retrieval over diligence documents (see
[Due diligence](due-diligence.md)). AI document intake (see
[Intake and valuation](intake-and-valuation.md)) also needs the LLM endpoint.

| Variable | Notes |
| --- | --- |
| `DOCLING_URL` | Docling service URL; without it, ingestion errors clearly rather than running |
| `DOCLING_API_KEY` | Docling credential |

The LLM endpoint itself is configured per tenant (`llm_endpoint`), so the model each account
uses is a tenant setting rather than a single global key.

## Billing: Stripe

| Variable | Notes |
| --- | --- |
| `ENABLE_BILLING` | Default on; set to `false` to run with no billing: no trial limits, banner, or trial emails, no billing or pricing pages, and no Stripe. Read on the server at request time, so one image serves every install |
| `STRIPE_SECRET_KEY` | Stripe API key. Needed when billing is on; unset is allowed when billing is off |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhooks. Needed when billing is on; unset is allowed when billing is off |
| `STRIPE_API_BASE` | Optional. Sends Stripe API calls to this base URL, such as an e2e Stripe stand-in. Must use http or https, include an explicit port, and have no username, password, path, query, or fragment, for example `http://127.0.0.1:12111`. Leave unset or empty in production to use `api.stripe.com` |

Price ids are placeholders to swap for real ones ($99/mo and $990/yr starter).

## Notifications: Novu

Unlocks the deal-event notification relay and the trial drip (see
[Outreach and notifications](outreach-and-notifications.md)).

| Variable | Notes |
| --- | --- |
| `NOVU_API_KEY` | The secret key of one Novu environment (Novu dashboard, API Keys). The app triggers workflows with it, and Novu signs its calls to the app's bridge at `/api/novu` with the same key. When it is unset the bridge refuses every call with 401 |
| `NOVU_API_URL` | Novu host |
| `NOVU_OWNED_CHANNELS` | Which channels Novu owns |
| `LENDER_DIGEST_INTERVAL_MINUTES` | Optional. A positive whole number of minutes the lender new-documents digest batches over, such as `1` in e2e. Leave unset in production to batch until 22:00 UTC |
| `NOVU_SAFE_OUTBOUND_ALLOW` | Set on Novu's own `api` and `worker` services, not on the app. Novu refuses to call a bridge or an SMTP host that resolves to a private address unless the hostname, `.suffix`, IP, or CIDR is listed here, comma separated. `docker-compose.yml` defaults it to `host.docker.internal`; in a cluster list the web Service's full hostname, `<fullname>-web.<namespace>.svc.cluster.local` |

### Lender room workflows

The lender room emails (`lender_ask.opened`, `lender_ask.replied`, `lender_ask.answered`,
`lender_form.uploaded`, `lender_form.returned`, `lender_form.signature_completed`,
`lender_form.signature_declined`, `lender_form.signature_expired`, `lender_room.access_requested`, `lender_room.timeline_answered`, and the daily
`lender-room-documents` digest) are defined in `packages/features/notifications/src/server/lender-workflows`
and served to Novu by the bridge at `/api/novu`. Nothing is built in the Novu dashboard. Novu
calls the bridge to run each step, so names are read when an email is sent: the digest, sent
daily at 22:00 UTC, lists only the files the person can still see at that moment.

The deal event notices (`deal.offer_submitted`, `deal.offer_accepted`, `deal.loi_accepted`,
`deal.apa_accepted`, `deal.resolved`) are defined in
`packages/features/notifications/src/server/deal-event-workflows`. Each one emails the team
members who can manage deals on the deal's account, and the relay writes the matching in-app
notification for the same people.

Register the workflows with Novu after the app is running. The call replaces what Novu holds
for this bridge, so repeating it is safe:

```bash
curl -X POST "$NOVU_API_URL/v1/bridge/sync?source=cli" \
  -H "Authorization: ApiKey $NOVU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"bridgeUrl": "http://host.docker.internal:3000/api/novu"}'
```

`bridgeUrl` is the address Novu's containers use to reach the app, which is why the local
value is `host.docker.internal` and not `localhost`. The Helm chart runs the same call from the
`novu-sync` hook Job after every install and upgrade, with `bridgeUrl` set to
`http://<fullname>-web.<namespace>.svc.cluster.local:3000/api/novu` (the release namespace, so
Novu reaches it from its own namespace); it skips itself
when `NOVU_API_KEY` or `NOVU_API_URL` is unset. Deploy with `--wait` so the Job reads the new
version of the bridge.

The same Job then sends Novu's emails through the app's SMTP settings. It finds its Custom
SMTP (`nodemailer`) email integration in the key's environment by the identifier
`opendealbook-smtp`, overwrites its credentials or creates it, and makes it the active primary.
Other integrations stay as they are. It reads the `EMAIL_*` keys in
[Transactional email](#transactional-email). `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SENDER`, and
`EMAIL_SENDER_NAME` are required: when any is unset, the Job still syncs the workflows, then
fails and names the missing keys. `EMAIL_USER` and `EMAIL_PASSWORD` are sent only when set.
Local development has no Job, so add the integration by hand there (Novu dashboard,
Integrations).

## Background workflows: Temporal

| Variable | Notes |
| --- | --- |
| `TEMPORAL_ADDRESS` | The Temporal frontend address for `apps/workers` |

Scheduled workflows (SBA comp refresh, outreach dispatch) also need their schedules started,
not just the worker connected.

## Transactional email

| Variable | Notes |
| --- | --- |
| `MAILER_PROVIDER` / `MAILER_PROVIDERS` | Selects the provider (nodemailer or resend) |
| `RESEND_API_KEY` | Resend provider |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_TLS` | SMTP (nodemailer) provider |
| `EMAIL_SENDER` | The from address of Novu's emails |
| `EMAIL_SENDER_NAME` | The sender name of Novu's emails |
| `EMAIL_TEMPLATE_RENDERERS` | Template renderer selection |
| `SELLER_DELIVERY_FROM_EMAIL` | The from address of the email that delivers a document to a seller, and of the email that tells the sender a delivery failed or was refused, read by `apps/workers` and the web app. Unset, Send to seller refuses with "Seller email is not set up" and queues nothing, and a delivery already queued fails without retrying |

This is the transactional mailer, separate from the send-as-user outreach mailbox.

## Analytics: PostHog

| Variable | Notes |
| --- | --- |
| `POSTHOG_KEY` | PostHog project key |
| `POSTHOG_HOST` | PostHog host |

## Marketing site toggle

| Variable | Notes |
| --- | --- |
| `ENABLE_MARKETING` | Default on; set to `false` to disable the public marketing surface. Read on the server at request time, so one image serves every install |

With marketing off, the app boots straight to auth and the app, and the public pages, robots,
and sitemap are gated off. This is the difference between the public hosted instance (on) and a
private self-hosted install (off).

## Deploy prerequisites

- Build the image with real `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  build arguments, or the browser auth UI will not load.
- Set the `app.mfa_recovery_pepper` GUC in production.
- Start the Temporal worker and the scheduled workflows for comp refresh and outreach.
- The platform is designed to self-host its backing services in-cluster; see
  [Architecture](architecture.md).
