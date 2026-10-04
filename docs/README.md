# OpenDealbook system guide

OpenDealbook (brand "Open Deal Book", app package `web`, repo directory "Tuckin") is a
multi-tenant acquisition platform for CPA firms and small-business acquirers. It carries a
buyer from sourcing a target through NDA, letter of intent, due diligence, purchase
agreement, and post-close integration, with the financial calculators, document pipeline,
data room, comparables, and outreach a working deal desk needs. The deal itself is
event-sourced: every change to a deal is an append-only event, and the tables you read are
synchronous projections of that log, so each deal keeps a full audit trail of what happened
and why.

This guide documents what the system actually supports today, verified against the code and
schema, not a wish list.

## Contents

- [Overview](overview.md) - what the product is, who it serves, and the technical shape.
- [Accounts and access](accounts-and-access.md) - personal vs team accounts, roles,
  permissions, and external participants including sellers.
- [Deal lifecycle](deal-lifecycle.md) - the ten pipeline stages and what the system supports
  at each one. The centrepiece.
- [Intake and valuation](intake-and-valuation.md) - AI document intake, the deal-box screen,
  and the SDE / EBITDA calculators.
- [Offers, LOI and APA](offers-loi-apa.md) - immutable offer versions, acceptance, and the
  signature-driven document pipeline.
- [Checklists and todos](checklists-and-todos.md) - template-driven checklists and the
  per-user todo list.
- [Due diligence](due-diligence.md) - meetings, data room, seller Q&A, HR audit, document
  verification, the diligence schedule, and workbooks.
- [Comparables](comparables.md) - comp data classes, the anonymized platform pools, data
  ingestion, and duplicate detection.
- [Outreach and notifications](outreach-and-notifications.md) - send-as-user cold outreach
  and the notification relay.
- [Close and integration](close-and-integration.md) - per-client transition tracking.
- [Architecture](architecture.md) - the event store, multi-tenant RLS, storage, and the
  optional integrations.
- [Configuration](configuration.md) - what must be set to go live, keyed by feature.

## Conventions used in this guide

- "Account" is the tenant. Everything is scoped by `account_id` and enforced by
  Row Level Security.
- Stage keys (`loi_submitted`, `due_diligence`, and so on) are the stable identifiers;
  their display labels are per-account and editable.
- Features behind an external integration are noted as such. Each integration is optional
  and gated by environment variables; see [Configuration](configuration.md).
