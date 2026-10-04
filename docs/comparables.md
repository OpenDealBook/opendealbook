# Comparables

The comparables ("comps") module gives a buyer transaction data to sanity-check valuation. Its
core rule is a privacy invariant enforced in the database, not in app code.

## Data classes

Every `comp` row carries a `data_class` that is set once at insert and frozen by a trigger:

| Class | Source | Visibility |
| --- | --- | --- |
| `external` | Public / open data (SBA FOIA, published survey multiples, and the like) | Visible to all tenants |
| `proprietary` | Vendor-seat data (DealStats, BIZCOMPS, PeerComps) imported by file | Tenant-only, behind an active license; never in any cross-tenant path |
| `internal` | The tenant's own closed deals and contributed outcomes | Tenant-only, opt-in to the pool |

A proprietary row is readable only while the owning tenant holds an active `comp_license`, and
no cross-tenant aggregate or view ever references a proprietary row. External rows must carry a
`source` and a human-readable `source_label` (for example "SBA 7(a)/504 FOIA" or "DealStats"),
so attribution always shows. Comps also carry a `price_basis` and `confidence`.

## The anonymized platform pools

Two platform-owned datasets are the moat, built only from external and opted-in internal data:

- **`comp_pool`** - anonymized closed deals, with a pseudonym (`<state> <industry> <seq>`),
  rounded money, banded counts, and a k-anonymity minimum (default 5) enforced at read time in
  the view, so small buckets are hidden or coarsened.
- **`activity_pool`** - an anonymized row for every deal from creation, carrying a confidence
  level (listed / screened / verified), the asking-versus-LOI spread, the furthest stage
  reached, and the outcome with a fixed-picklist loss reason.

The only link between a pseudonym and a real deal lives in platform-admin-only key tables
(`comp_pool_key`, `activity_pool_key`), never in a view or export. The anonymization code is a
single pure module (`packages/comps`), run identically hosted and self-hosted, so it is the one
trust boundary data crosses before leaving a tenant. Consent is via tenant terms (hosted) or a
per-account opt-in (`comp_pool_optin`, self-hosted).

## Getting data in

- **SBA FOIA ingest.** A scheduled Temporal workflow (`RefreshSbaLoans`) discovers the live SBA
  7(a) / 504 FOIA CSV URLs through the CKAN API (dated filenames, not hard-coded), filters to
  the union of tenants' deal-box NAICS, derives a price from the loan amount using an
  account-adjustable loan-to-price proxy (default 0.85), and upserts the rows as external comps
  labeled by source.
- **Vendor import.** Proprietary vendor exports (DealStats, BIZCOMPS, PeerComps) are imported
  from a CSV export file through per-vendor column maps. The raw export file is stored under the
  tenant prefix in the `vendor-imports` storage bucket, behind the proprietary license
  predicate, and never enters a cross-tenant path. The reachable UI is at
  `/home/[account]/comps/import`.
- **DealStats contributor package.** When a deal closes, the platform can generate a one-click
  DealStats contributor submission package from the closed-deal facts, so a tenant that
  contributes can keep a free contributor license. The submission itself is manual.
- **Generic external providers.** A `CompProvider` interface (`packages/comps/provider.ts`)
  lets external comp APIs be plugged in as a direct feed without a model change.

## Duplicate detection

Duplicate detection runs when a deal is created. Conservative defaults mean only an exact
listing-id or URL match auto-tags a deal as a duplicate (`deal.duplicate_of`); softer signals
only raise a `duplicate_candidate` for review. Confirmations are reversible for a window.
`deal.capture_method` and `deal.source_url` record how a deal was captured.
