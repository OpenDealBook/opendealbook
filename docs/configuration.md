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

Multi-factor recovery also needs a Postgres GUC, `app.mfa_recovery_pepper`, set in production
(it is the HMAC pepper for recovery codes).

## E-signature: Documenso (LOI / APA)

Unlocks the document signature pipeline and the signature-driven stage transitions (see
[Offers, LOI and APA](offers-loi-apa.md)).

| Variable | Notes |
| --- | --- |
| `DOCUMENSO_URL` | The Documenso instance URL |
| `DOCUMENSO_API_TOKEN` / `DOCUMENSO_API_KEY` | API credential |

Also required to go live, beyond env: the LOI and APA **template language is user-provided**
(the seed ships placeholders only); the **signer model** currently has a single buyer signer
and a real LOI needs the seller added; and the rendered-output-to-signing **bucket handoff**
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
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhooks |

Price ids are placeholders to swap for real ones ($99/mo and $990/yr starter).

## Notifications: Novu

Unlocks the deal-event notification relay and the trial drip (see
[Outreach and notifications](outreach-and-notifications.md)).

| Variable | Notes |
| --- | --- |
| `NOVU_API_KEY` | Novu credential |
| `NOVU_API_URL` | Novu host |
| `NOVU_OWNED_CHANNELS` | Which channels Novu owns |

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
| `EMAIL_TEMPLATE_RENDERERS` | Template renderer selection |

This is the transactional mailer, separate from the send-as-user outreach mailbox.

## Analytics: PostHog

| Variable | Notes |
| --- | --- |
| `POSTHOG_KEY` | PostHog project key |
| `POSTHOG_HOST` | PostHog host |

## Marketing site toggle

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_MARKETING` | Default on; set to `false` to disable the public marketing surface. Must be a literal so it is inlined at build time |

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
