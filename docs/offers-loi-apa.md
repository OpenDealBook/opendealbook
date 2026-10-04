# Offers, LOI and APA

## Offers as immutable versions

An offer on a deal is a chain of immutable typed versions. The `offer` row tracks the current
version and status; each `offer_version` is frozen once added (the projector only ever inserts
versions, never updates them), so a submitted version is a permanent record. There is one
active offer per deal.

Each version carries:

- `number` (unique within the offer), `author_side` (`buyer` or `seller`, so seller counters
  are first-class), `purchase_price`, `real_estate_portion`, `target_close_date`,
  `offer_expires_at`, `exclusivity_days`, `diligence_days`.
- A `terms` JSON blob validated application-side by a versioned Zod schema
  (`offerTermsSchema`). Price, structure (cash at close, earnout, working-capital peg),
  financing (funding sources, seller note), deposits and escrow, timing, contingencies, and
  seller terms (non-compete, training, consulting) all live inside this blob, not in sibling
  tables.
- A link to the `calc_version` the price came from.

Any two versions can be diffed term by term (`diffOfferTerms`). An offer can be created from a
calculator, which copies the price and funding and records the calc version.

## Lifecycle

```
Draft -> Submitted -> Countered / Accepted / Rejected / Withdrawn / Expired
```

- **Submitting** an offer moves the deal to `loi_submitted`.
- **Acceptance** means the accepted offer version is the agreed terms. Exclusivity and
  diligence clocks start from it.
- One offer per deal; terminal states are guarded; an expired or rejected offer does not
  auto-resolve the deal.

The offer lifecycle actions emit deal events (`offer.*`) that project the `offer` and
`offer_version` rows and drive the deal stage. See [Architecture](architecture.md).

## Generating the LOI

The letter of intent is generated from the pinned offer version, not drafted free-hand.

1. **Gate.** Generate LOI is enabled only once the deal's initial numbers are entered and the
   deal passes the deal-box screen (the account deal box `min_dscr` and
   `required_personal_cash_flow` against the adopted calculation snapshot). See
   [Intake and valuation](intake-and-valuation.md).
2. **Render.** `generateLoi` renders the LOI from a `document_template` and the offer version.
3. **Sign.** The rendered document is sent through Documenso for e-signature.
4. **Advance.** When all parties sign, the Documenso webhook
   (`apps/web/app/api/webhooks/documenso/route.ts`) marks the contract version signed and the
   deal auto-advances from `loi_submitted` to `loi_accepted`.

The accepted offer version is pinned to the contract (`source_offer_version_id`), so there is
one document lineage from offer to signed artifact.

## The APA mirrors the LOI

The purchase agreement is an offer document of kind `apa` and follows the same pipeline:
`generateApa` renders from a template and the offer terms, sends through Documenso, and on
full signature the webhook advances the deal from `pa_submitted` to `pa_accepted`.

## What the operator provides

The document pipeline is wired but intentionally content- and config-gated:

- **Template language.** The LOI and APA template bodies are user-provided. The seed ships
  placeholder templates only.
- **Documenso configuration.** The Documenso URL and API token must be set; until then the
  e-sign step is dark. See [Configuration](configuration.md).
- **Signer model.** The current signer model is a single buyer signer; a real LOI needs the
  seller as a signer too. This is a known activation item.
- **Storage buckets.** Rendered output is written to the `generated` bucket and the e-sign
  step reads from `contracts`; reconciling that bucket handoff is part of activating the
  pipeline.
