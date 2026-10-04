# Intake and valuation

## AI document intake

A deal can be created from documents instead of a blank form. The flow lives in
`packages/features/deals/src/server/intake-actions.ts` and runs:

1. **Drop in documents.** The user pastes text or uploads a PDF. PDF text is extracted with
   `unpdf`.
2. **AI extraction.** The text is sent to `@odb/ai`, which returns a structured draft
   (`generateStructured` / `extractDeal`). Scope is both screening numbers (revenue, SDE,
   EBITDA, asking price, industry, location) and the fuller profile (description, employees,
   business model, reason for sale), producing a first-draft `deal_profile` and
   `deal_financials`.
3. **Review and confirm.** The user checks the draft before anything is persisted. Nothing is
   saved until confirmed.
4. **Create.** On confirm, the deal is created with its profile and headline figures.

Intake is available in two places:

- A **new-deal path**: upload, extract, review, create.
- A **re-run** action on an existing deal (`rerunDealIntake`) to extract again. Re-run is
  paste-based today; PDF re-run is not yet wired.

AI intake depends on the LLM endpoint being configured; see [Configuration](configuration.md).

## The deal box

The deal box (`deal_box`) is the account's buying criteria, set during onboarding and in
settings. It is account-level configuration, not part of a single deal, and holds:

- `min_dscr` - the minimum debt-service-coverage ratio the account will underwrite.
- `required_personal_cash_flow` - the cash flow the buyer needs the deal to throw off.
- Screening criteria such as target industries (NAICS), plus a broker summary.

The deal box does two jobs:

- **Screening.** A target's entered numbers are tested against the box, so a buyer can see at a
  glance whether a deal clears their floor.
- **The LOI gate.** An LOI can only be generated once the deal's initial numbers are in and the
  deal passes the deal-box screen (DSCR and required cash flow against the adopted calculation
  snapshot). See [Offers, LOI and APA](offers-loi-apa.md).

## Calculators

The financial math lives in `packages/calculators` as pure, tested, framework-free functions.
Outputs are computed at read time, and a snapshot of key outputs is saved when a calculator
version is saved. There are three calculator types, each saved as a `calc_version`:

### SDE (recast P&L)

Recasts the profit-and-loss into seller's discretionary earnings. Columns are fiscal years or
TTM, each with a weight (SBA default 50 / 25 / 25, newest first) and an optional partial-year
month count. Net income plus the standard add-backs (depreciation and amortization, interest,
corporate taxes, one owner salary and payroll taxes) gives basic discretionary earnings; minor
add-backs are added on top. Partial years are annualized, then the weighted SDE is the
weight-sum of the annualized columns.

- Weights are kept as entered (no normalization) but must sum to 1, which is validated on save.
- **Acceptance figure:** the reference inputs reproduce a weighted SDE of **$507,676**.

### Deal (financing and returns)

Takes a purchase price, tax rate, closing costs, funding sources (SBA 7(a) / 504,
conventional, seller financing, cash equity, HELOC, ROBS-401k, investor equity, mezzanine,
other), a P&L importable from an SDE version, a growth rate, and the deal box. It computes
loan amortization and year-one debt service, net cash flow, the tax-adjusted DSCR, the
purchase multiple, cash-on-cash, payback, the deal-box gap, a ten-year pro forma, and a DSCR
sensitivity band.

- A seller note on standby accrues interest during the standby period and amortizes the
  accrued balance afterward; year-one debt service excludes standby-period payments.
- Buyer equity is derived from the capital stack (total uses minus total debt) by default and
  can be overridden.
- Undisclosed inputs are stored as null, so derived values are null rather than a misleading
  zero or an infinite multiple.
- **Acceptance figure:** the reference inputs reproduce a tax-adjusted **DSCR of 1.43x**
  (with a purchase multiple of 4.05x and year-one net cash flow of $59,721).

### Working capital

Current assets minus current liabilities plus the months of revenue to be covered.

### Bands and assumptions

On top of the point formulas, a bands engine lets any driver (growth, rate, tax rate, SDE,
price, and so on) be a scalar or a band or a swept range, so the same calculator returns either
a single number or a series for charts. The all-scalar case is consistent with the point
result.

## Earnings basis: SDE or EBITDA

A deal can be viewed through SDE or through EBITDA. The basis is saved per deal
(`deal.earnings_basis`, default `sde`) and affects the **valuation display only**: the headline
earnings figure, the valuation multiple, and the margin switch and relabel to the chosen basis.
Underwriting (DSCR and cash-flow analysis) stays SDE and cash-flow based regardless. Both
`adopted_sde` and `adopted_ebitda` are stored on `deal_financials`, and a server action records
the chosen basis as a deal event.
