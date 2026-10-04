# Deal lifecycle

A deal moves through an ordered pipeline of stages. Each account owns its own set of stages
(`pipeline_stage`), seeded at account creation and editable: an account can rename, reorder,
or add stages. A deal's `stage` is a text key that is foreign-keyed to its account's stages,
so a deal always references a real stage in its own account.

The default seed is **ten stages**, in this order:

| # | Stage key | Default label | What it means |
| --- | --- | --- | --- |
| 1 | `sourcing` | Sourcing | Target found and being screened |
| 2 | `pre_nda` | Pre-NDA | Contact made, NDA not yet signed |
| 3 | `nda_signed` | NDA Signed | NDA executed, detail flowing |
| 4 | `loi_submitted` | LOI Submitted | Letter of intent generated and out for signature |
| 5 | `loi_accepted` | LOI Accepted | LOI fully signed |
| 6 | `due_diligence` | Due Diligence | The deep diligence phase |
| 7 | `pa_submitted` | PA Submitted | Purchase agreement out for signature |
| 8 | `pa_accepted` | PA Accepted | Purchase agreement fully signed |
| 9 | `announcement` | Announcement | Post-close announcement |
| 10 | `integration` | Integration | Clients and operations moved to the buyer |

Note on the source: the seed function `seed_default_pipeline_stages` inserts all ten rows above.
A stale comment at the top of the schema file still says "9-stage pipeline"; the code inserts
ten, and `due_diligence` was added between `loi_accepted` and `pa_submitted` because that is
where a deal is most likely to fail. The code is authoritative.

## Stage is separate from resolution

Terminality is not a stage. Every seeded stage is non-terminal. A deal carries its outcome in
separate fields:

- `deal.resolution` - null while the deal is open; otherwise the structured outcome
  (won or lost).
- `deal.resolution_reason` - the structured reason, required when a deal is marked lost.
- A resolved deal **keeps the stage it reached**. A deal that dies in diligence stays at
  `due_diligence` and is marked lost; it does not move to a "dead" stage.
- `deal.listing_status` (`active` / `pulled` / `sold`) is tracked independently and drives a
  "Pulled" indicator.
- `deal.archived_at` hides a deal from the active lists, independent of resolution.

A legacy free-text `deal.outcome_reason` also exists; it feeds the comparables activity pool
(see [Comparables](comparables.md)) and is a different taxonomy from `resolution_reason`.

## How transitions happen

Most stage changes are explicit user actions on the deal. Two transitions are
**signature-driven**:

- At `loi_submitted`, when the letter of intent is fully signed (reported by the Documenso
  webhook), the deal auto-advances to `loi_accepted` and on into `due_diligence`.
- At `pa_submitted`, when the purchase agreement is fully signed, the deal auto-advances to
  `pa_accepted`.

There is also a **gate before an LOI can be generated**: the deal's headline numbers must be
entered and the deal must pass the deal-box screen (the account's `deal_box` criteria,
`min_dscr` and `required_personal_cash_flow`, measured against the adopted calculation
snapshot). See [Offers, LOI and APA](offers-loi-apa.md) and
[Intake and valuation](intake-and-valuation.md).

## What the system supports at each stage

Many features (calculators, offers, checklists, the data room) are available throughout; the
list below highlights what each stage is for.

### 1. Sourcing

- Create a deal, manually or by AI document intake (paste or PDF), which drafts a full profile
  for review before it is saved. See [Intake and valuation](intake-and-valuation.md).
- Capture a listing (from a URL or manually), with duplicate detection on create.
- Enter the target's headline numbers (asking price, revenue, SDE, EBITDA) and a profile
  (industry, location, employees, reason for sale).
- Screen against the account deal box and run the SDE / deal / working-capital calculators as
  scratch scenarios.
- Enroll the target in single-touch cold outreach from the operator's own mailbox. See
  [Outreach and notifications](outreach-and-notifications.md).

### 2. Pre-NDA

- Track the deal as contacted but not yet under NDA.
- Continue refining numbers and calculator scenarios.
- Add participants (brokers, the seller) with scoped per-deal access.

### 3. NDA signed

- Fuller financials flow in; adopt a calculator version to the deal's official figures
  (`deal_financials`).
- Build out the deal profile and thesis (internal, never shown to the seller).

### 4. LOI submitted

- Build an offer as a chain of immutable versions, then submit it (this is what moves the deal
  to `loi_submitted`).
- Once the deal passes the deal-box screen, **Generate LOI** renders the letter of intent from
  the pinned offer version and sends it through Documenso for e-signature.
- The deal waits here for signatures.

### 5. LOI accepted

- Reached automatically when the LOI is fully signed. `loi_accepted` means "LOI fully signed",
  and the accepted offer version is the agreed terms.
- Exclusivity and diligence clocks start from the accepted terms.
- The deal moves into due diligence.

### 6. Due diligence

- The widest stage. The system supports:
  - **Meetings**: manual scheduling, per-participant calendar integration, and post-meeting
    upload of a recording or transcript with an optional AI summary.
  - **Data room**: upload and browse supporting documents.
  - **Seller Q&A**: the buyer poses questions; the seller answers through the portal (unlocked
    by the signed LOI); buyer-private notes the seller never sees.
  - **HR audit** of the target's employees.
  - **Document verification and retrieval** over uploaded documents (Docling plus an LLM,
    environment-gated).
  - A **diligence schedule** laid out in weeks.
  - **Financial workbooks**.
- All of this is detailed in [Due diligence](due-diligence.md).

### 7. PA submitted

- Build the purchase agreement as an offer document of kind APA, mirroring the LOI flow.
- Generate the APA and send it through Documenso for e-signature. The deal waits here.

### 8. PA accepted

- Reached automatically when the purchase agreement is fully signed.
- Closing checklists apply.

### 9. Announcement

- Post-close announcement work. The post-close checklist kind applies here.

### 10. Integration

- Move the acquired business onto the buyer. Per-client transition tracking
  (`client_transition`) follows each client through engagement letter, 7216 consent, e-file
  authorization, and portal migration. See [Close and integration](close-and-integration.md).

## The deals list

The deals list groups deals and offers faceted search:

- **Groups**: actively pursuing, early funnel (sourcing and pre-NDA), closed and off-track
  (resolved), and archived.
- **Facets**: full-text search (title, industry, location, broker), stage, resolution,
  industry, location, asking / revenue / SDE ranges (with an include-undisclosed toggle),
  multiple and margin ranges, listing status, owner, starred, days-in-stage, and archived.
- Filters are reflected in the URL so a view is bookmarkable.
- Per-deal **stars** are personal, and deals can be archived or resolved from the row.
