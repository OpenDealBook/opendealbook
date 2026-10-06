# Operating and onboarding

Once a deal closes, the acquired business keeps living on the same deal record: a won deal
is the operating business, not a separate entity. Three pieces support the first stretch of
owning it: monthly operating actuals compared against the underwriting, a pair of seeded
post-close checklist templates anchored to the close date, and a set of structured worksheets
for the analysis buyers run in the first 90 days. All three are buyer-account-internal: read
is gated on `has_role_on_account` and write on `deals.manage`, never on `has_deal_permission`,
so a seller `deal_participant` never sees them (see
[Accounts and access](accounts-and-access.md)).

## Operating metrics

Each month of actuals is one `deal_operating_period` row, keyed by `(deal_id, period_month)`.
Every figure is nullable, since a month records only what is known so far:

| Field | What it tracks |
| --- | --- |
| `period_month` | The month the row covers |
| `revenue` | Revenue for the month |
| `cogs` | Cost of goods sold |
| `opex` | Operating expenses |
| `cash_balance` | Cash balance at month end |
| `headcount` | Headcount at month end |
| `debt_service` | Debt service paid (on the table; not yet on the entry form) |
| `notes` | Free text (on the table; not yet on the entry form) |

From the stored periods the system derives, per month, net operating income
(revenue minus cogs minus opex) and operating margin (net operating income over revenue); a
month missing any of the inputs it needs simply has a null derived value rather than treating
the gap as zero. Across the trailing twelve recorded months it also computes an annualized
revenue and an annualized net operating income, and compares each to the deal's adopted
underwriting baseline on `deal_financials` (`adopted_revenue` for revenue,
`adopted_sde` for net operating income) as an absolute and a percent delta.

The dashboard at `/home/.../deals/[id]/operating` (the Operating tab) shows the latest
month's revenue, net operating income, operating margin, cash balance and headcount; a
monthly trend of revenue and net operating income; the actual-vs-underwriting variance; and a
form to add or edit one month at a time. There is no accounting-system integration of any
kind; every figure, including cash balance, is typed in by hand.

## Post-close checklist templates

Post-close work rides the same checklist model as the rest of the deal; see
[Checklists and todos](checklists-and-todos.md) for the template, status and due-offset
mechanics. Two `post_close` templates are seeded per account:

| Template | Covers |
| --- | --- |
| `Day 0 Takeover` | Same-day cutover tasks grouped by category (customers, employees, financial, legal and taxes, owner transition, operations), all at a due offset of 0 days |
| `First 90 Days` | A phased transition plan from week 1 through day 90, with due offsets from 1 to 90 days |

A `post_close` template is the one kind where applying it also resolves a due date: the deal's
`close_date` plus the item's `due_offset_days` becomes the new item's `due_at`. If either the
close date or the item's offset is null, `due_at` is left null. Templates of the other kinds
(`offer`, `diligence`, `closing`) don't get this treatment, their items keep whatever
`due_offset_days` the template has without it being resolved to a date.

## Worksheets

A worksheet is a set of `deal_worksheet_row` rows sharing a `(deal_id, worksheet_type)`; there
is no separate parent table. `worksheet_type` is one of four kinds, each for a different piece
of post-close analysis:

| Worksheet type | What it's for |
| --- | --- |
| `margin_analysis` | Line-item revenue and direct cost, with margin and margin % worked out per row |
| `retention_plan` | Key employees, flight risk, and a retention action |
| `process_sop` | Standard operating procedures and who owns documenting them |
| `marketing_effectiveness` | Spend, leads and customers per channel, with cost per acquired customer worked out per row |

Each row's field values live in a `data` jsonb column. Which fields apply to a given
worksheet type, and whether each is text, number, currency, or a fixed-option select, is
defined in the app layer rather than the schema. The margin, margin %, and cost-per-customer
figures are worked out from the stored fields each time a row is read; they are not stored
themselves. Rows are gated the same way as operating periods: read on `has_role_on_account`,
write on `deals.manage`.

The Worksheets tab (`/home/.../deals/[id]/worksheets`) shows all four worksheet types as
separate tables on one page, each with its own add-row form. As with operating metrics, entry
is manual; there is no import from an outside system.
