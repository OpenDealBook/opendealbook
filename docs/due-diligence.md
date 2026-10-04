# Due diligence

Due diligence is the widest stage (see [Deal lifecycle](deal-lifecycle.md)). The platform
supports several parallel diligence workspaces on a deal. All of them are deal-scoped and
reached through account membership or a per-deal participant grant.

## Meetings and calendar

Meetings are tracked per deal (`meeting`), optionally grouped into a recurring series. The
user ruled that scheduling is **manual** for now (auto-weekly-with-opt-out is a later
expansion):

- **Schedule a meeting** on the deal and record when the group met. Meeting type is `weekly`
  or `site_visit`; status moves through `scheduled`, `held`, `skipped`, `cancelled`.
- **Calendar integration is per participant, through Nango.** Each participant links their own
  Google or Microsoft calendar (`calendar_connection`, modeled on the mailbox connection, with
  a connect-session flow analogous to the mailbox). The connection's natural key is
  (account, user, provider). A scheduled meeting can be pushed as an event to each connected
  participant's calendar.
- **After the meeting**, upload a recording file or a transcript. These land in the
  `meeting-recordings` storage bucket (deal-scoped). The meeting row holds
  `recording_path`, `transcript_path`, `transcript_text`, and a `summary`, and an optional
  `@odb/ai` summary can be generated from the transcript. This is post-meeting upload, not
  live recording.

Calendar push depends on the Nango calendar integration being configured; see
[Configuration](configuration.md).

## Data room

A per-deal document store. Users upload and browse supporting documents. Files live in the
`data-room` storage bucket, keyed by deal id and access-gated through `has_deal_permission`,
alongside the `dr_document` and upload-batch tables. The feature gates on `deals.manage`.

## Seller Q&A

The buyer poses diligence questions and the seller answers them, unlocked after the LOI is
signed.

- **Questions** (`seller_question`) carry the question, an answer, a status, and an optional
  link to a schedule week. Posing and managing questions is gated on `checklists.manage`.
- **The seller answers through the portal.** The seller is a `deal_participant` with
  `party = 'seller'`; a dedicated write policy lets a non-expired seller participant update the
  question row to fill in the answer, which is what makes the seller portal (`/seller/[dealId]`)
  work. The seller sees the question and answer only.
- **Buyer-private notes** live in a separate table, `seller_question_note`. Its RLS is gated on
  buyer-account membership only, never on `has_deal_permission`, so a seller participant can
  never read or write it. Keeping the notes in a separate table (rather than a hidden column on
  the question row) is what guarantees the seller cannot see them.
- **Notifications** fire both ways through Novu: the seller is notified when a question is
  posed, the buyer when it is answered, gated by notification preferences. See
  [Outreach and notifications](outreach-and-notifications.md).

## HR audit

An HR audit workspace (`hr_audit_engagement`, `employee`, reached at
`/home/[account]/deals/[id]/hr-audit`) audits the target's workforce as part of diligence.

## Document verification and retrieval

A document-verification and retrieval-augmented-generation layer runs over uploaded documents:
Docling extracts and chunks document text, chunks are embedded, and an LLM reconciles findings
(for example payroll tax against W-2s, or revenue against marketing claims) into a
verification run with severity-graded findings. Retrieval is per deal through the tenant's LLM
endpoint. This whole layer is environment-gated on Docling and the LLM endpoint; until those
are configured it stays dark. See [Configuration](configuration.md).

## The diligence schedule

Diligence is laid out as a schedule of weeks (`diligence_schedule`, `schedule_week`, reached at
`/home/[account]/deals/[id]/schedule`). Checklist items and seller questions can be assigned to
a week, so work is paced across the diligence window.

## Financial workbooks

Workbooks (`workbook`, `workbook_run`, from workbook templates, reached at
`/home/[account]/deals/[id]/workbooks`) carry structured financial analysis on the deal beyond
the headline calculators.
