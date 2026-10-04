# Close and integration

The last two stages, `announcement` and `integration` (see
[Deal lifecycle](deal-lifecycle.md)), cover the post-close move of the acquired business onto
the buyer. For a CPA-firm acquisition, the practical work is moving individual clients over,
one at a time, and the platform tracks that explicitly.

## Per-client transition tracking

Each acquired client is a `client_transition` row on the deal. Every row follows one client
through the paperwork required to move them to the buyer, with each step using the standard
four-status checklist model (`not_started`, `requested`, `received`, `reviewed`):

| Field | What it tracks |
| --- | --- |
| `engagement_letter_status` | Signing a new engagement letter with the buyer |
| `consent_7216_status` | The IRC 7216 consent to disclose or use tax return information |
| `efile_auth_status` | E-file authorization moved to the buyer |
| `portal_migration_status` | Moving the client onto the buyer's portal |

Client transitions are deal-scoped and managed with `deals.manage`, readable by account
members and by participants with deal access. The reachable UI is the deal close page
(`/home/.../deals/[id]/close`).

A deal in these stages is still an ordinary open deal: its final won/lost resolution is a
separate field (see [Deal lifecycle](deal-lifecycle.md)), and a closed-won deal can also feed
the comparables pools and a DealStats contributor package (see [Comparables](comparables.md)).
