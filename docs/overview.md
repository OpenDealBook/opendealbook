# Overview

## What OpenDealbook is

OpenDealbook is a platform for running small-business acquisitions end to end. A buyer sources
a target, screens it against their own investment criteria, negotiates a letter of intent,
runs due diligence, signs a purchase agreement, and integrates the acquired business. The
platform holds the structured deal record, the financial models behind every number, the
negotiated offer history, the signable documents, the diligence workspace, and a comparables
dataset to sanity-check valuation.

## Who it serves

The primary user is a CPA firm acquiring other accounting practices, and more broadly any
small-business acquirer who runs a repeatable deal process. The domain model reflects this:
post-close "integration" tracks moving individual clients over to the buyer (engagement
letters, 7216 consents, e-file authorizations, portal migration), and HR audits and
client-transition paperwork are first-class diligence artifacts.

The platform can run in two shapes from one codebase:

- A public hosted instance (marketing site on) at opendealbook.com.
- A private self-hosted install (marketing site off, boots straight to the app).

The split is a config flag; see [Configuration](configuration.md).

## End-to-end shape

A deal moves through ten pipeline stages, from `sourcing` to `integration`. Progress is driven
by what the user does and, at two points, by document signatures:

1. Source and screen a target, entering its headline numbers against the account's deal box.
2. Advance through pre-NDA and signed-NDA contact.
3. Build an offer, generate a letter of intent, and send it for e-signature. The signature
   advances the deal.
4. Run due diligence: meetings, data room, seller questions, HR audit, financial workbooks,
   document verification.
5. Generate a purchase agreement, send it for e-signature. The signature advances the deal.
6. Announce and integrate.

A deal's outcome (won or lost, with a reason) is tracked separately from its stage, so a deal
that dies keeps the furthest stage it reached. See [Deal lifecycle](deal-lifecycle.md).

## Technical shape

- **Next.js app** (`apps/web`) in a pnpm + Turborepo monorepo, with feature logic in
  `packages/*`. Background work runs in Temporal workers (`apps/workers`).
- **Supabase** for auth, Postgres, and storage. Identity is Supabase Auth with custom
  TOTP multi-factor and recovery codes. Tenancy is the `accounts` row; every table enforces
  Row Level Security keyed off `auth.uid()`, membership helpers, and per-deal participant
  grants. See [Accounts and access](accounts-and-access.md).
- **Event-sourced deals.** A single append-only `deal_event` log is the source of truth for a
  deal's saga. Domain tables (deal, offer, checklist items, meetings, and more) are
  synchronous projections, rebuildable by replay, with direct writes revoked. See
  [Architecture](architecture.md).
- **Multi-tenant by account.** Personal accounts and team accounts both exist; the same deal
  features work in both.
- **Pure calculators** (`packages/calculators`) carry the SDE, deal-financing, and
  working-capital math as tested, framework-free functions. See
  [Intake and valuation](intake-and-valuation.md).
- **External integrations behind flags.** Nango (mailbox and calendar OAuth), Documenso
  (e-signature), Docling plus an LLM endpoint (document extraction and verification), Stripe
  (billing), Novu (notifications), and Temporal (workflows). Each is optional and
  environment-gated; a feature stays dark until its integration is configured. See
  [Configuration](configuration.md).
