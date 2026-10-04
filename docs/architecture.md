# Architecture

How OpenDealbook is built, and why it is shaped this way.

## The event store

A deal's history is the source of truth, not a snapshot of its current state. Everything that
happens inside a deal's saga is an append-only event, and the tables you read are synchronous
projections of that log.

- **`deal_event`** is the append-only log. Each row records the account, deal, aggregate
  (`aggregate_type` and `aggregate_id`), a free-text `event_type`, a JSON payload, the actor
  (`actor_kind` is `user` / `service` / `api_key` / `system`, plus an optional ref and via),
  and gapless per-deal and per-aggregate sequence numbers.
- **Writes go through one RPC.** `append_deal_event` (security definer) re-checks
  `has_deal_permission`, appends the event, and dispatches the per-aggregate projector upserts,
  all in a single transaction. There is no other insert path. Projector dispatch is explicit
  (not an after-insert trigger), so a replay re-derives projections cleanly.
- **Projections are DML-revoked.** Projection tables (deal, offer, offer_version, checklist
  items, meetings, participants, and the rest) have insert/update/delete revoked from both
  `authenticated` and `service_role`. They are read-only to callers; only the projectors,
  running as the table owner, write them. This is what enforces "the log is the truth".
- **Snapshots** (`deal_event_snapshot`) are materialized every 64 events at the aggregate and
  deal level, and a full rebuild can truncate and replay the log.
- A `@odb/events` wrapper (`appendDealEvent` / `appendDealEvents`) is the application entry
  point; cross-aggregate changes go in one batched append.

Not everything is evented. Scratch and account-level entities are plain RLS tables with direct
writes: the calculators' working tables (`calc_version`, `sde_period`, `sde_line`,
`deal_calc_input`, `funding_source`, `deal_thesis`), the account `deal_box`, and peripheral
aggregates such as `seller_question` and `firm` / `contact`. The event store is deal-scoped,
so account-level config like the deal box is deliberately kept conventional.

## Multi-tenant RLS

- The tenant is the `accounts` row. Every domain table has Row Level Security enabled and is
  scoped by `account_id`.
- Identity is Supabase Auth with custom TOTP multi-factor and HMAC recovery codes.
  SuperTokens was evaluated and rejected.
- Access flows through three helpers: `has_role_on_account`, `has_permission`, and
  `has_deal_permission` (which also honors per-deal `deal_participant` grants). The primary
  owner of an account holds every permission on it even without a membership row, which is what
  makes personal accounts work. See [Accounts and access](accounts-and-access.md).

## Storage buckets

All buckets are private; `service_role` bypasses RLS.

| Bucket | Backs | Path scoping |
| --- | --- | --- |
| `templates` | Uploaded LOI/APA template sources | account id (first path segment) |
| `generated` | Rendered document output | account id |
| `contracts` | Signable and signed contract PDFs | account id |
| `data-room` | Data-room documents | deal id (second segment), `has_deal_permission` |
| `meeting-recordings` | Meeting recordings and transcripts | deal id, `has_deal_permission` |
| `vendor-imports` | Raw proprietary comp vendor exports | account id |
| `buyer-profile` | Buyer-profile photos | account id |

## External integrations

Each integration is optional and environment-gated; a feature stays dark until its integration
is configured (see [Configuration](configuration.md)).

- **Nango** brokers OAuth for the user's own mailbox (cold outreach send-as-user) and for
  per-participant calendars (meeting push).
- **Documenso** is the e-signature provider for the LOI and APA pipeline; its webhook drives
  the signature-driven stage transitions.
- **Docling plus an LLM endpoint** power document extraction, verification, and retrieval. AI
  document intake also uses the LLM endpoint.
- **Stripe** is the billing provider.
- **Novu** relays deal-event notifications and the trial drip.
- **Temporal** runs background workflows (SBA comp refresh, outreach dispatch, document
  ingestion, announcement scheduling) in `apps/workers`.

## Build and deploy

The app ships as a single multi-stage Docker image (web and worker targets) built in CI and
pushed to a container registry. The public browser auth UI needs the public Supabase URL and
anon key inlined at build time, so those are build arguments, not just runtime env. The
platform is designed to self-host everything in-cluster (Supabase, Temporal, Novu, Docling,
Nango, Documenso, observability) from a CUE-authored chart, with two instances from one chart:
a public instance (marketing site off) and an internal instance (marketing site on). See
[Configuration](configuration.md).
