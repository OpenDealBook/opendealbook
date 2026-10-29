# Seller and partner interests workflow

Status: proposed product and technical specification. Date: 2026-10-23.
This document describes new functionality; it does not claim these workflows are implemented.

## Outcome and scope

Give the deal team a reliable answer before each meeting: who are we meeting, what matters to each person, what has changed, and what should we discuss or clarify? After the meeting, capture new evidence, have a person review it, and update the next brief without losing the history.

For this specification, a partner means an individual owner, firm partner, or other relationship contact involved in the deal. Interests include both deal priorities (staff continuity, timing, legacy, economics, future role) and voluntarily shared conversation topics (golf, community involvement, professional interests). These are separate categories so rapport topics never become implied deal requirements.

MVP is internal, account- and deal-scoped, and uses existing deal people. It supports multiple sellers/partners with different interests. Cross-deal relationship profiles, public research, automatic recording/transcription, external brief delivery, and autonomous outreach are outside MVP. Existing recordings, uploaded transcripts, and manual notes are inputs.

## Current foundations and required extensions

| Area | Existing foundation | Proposed addition |
| --- | --- | --- |
| Meetings | Scheduled/held/skipped/cancelled meetings, attendees JSON, notes, decisions, recording/transcript fields, AI summary | Structured attendee identity, versioned source snapshots, evidence review and brief panels |
| People | Deal people include contacts and users from seller rooms, team membership, counsel, and lender rooms | Stable deal-person reference for interests and speaker mapping; explicit identity linking |
| Events | Meeting writes use `appendDealEvent`; projections provide current state | Interest, evidence, review, source-ready, and brief events/projectors |
| Workflow engine | Temporal runner, published graph versions, event/manual/scheduled triggers, wait/branch/loop, AI, approval, todo and team notification steps | Meeting trigger allowlist entries, meeting identifiers in trigger output, typed context and persistence steps |
| Review | Generic approval is a yes/no decision | Per-candidate editing and evidence review in a domain screen, followed by a persisted review-completed event |

The current `ask_ai` step receives a configured prompt and can return JSON; it does not retrieve meeting records or validate domain evidence. Current event-trigger output exposes event type, deal/account IDs, and sequence, without a meeting ID. Neither capability should be assumed to exist implicitly.

Code references: [workflow graph](../../packages/workflows/src/builder/graph.ts), [step registry](../../packages/workflows/src/builder/registry.ts), [trigger output](../../packages/workflows/src/builder/editor/triggerOutputs.ts), [meeting schema](../../apps/web/supabase/schemas/53-meeting.sql), [meeting recording actions](../../packages/features/meetings/src/server/meeting-recording.ts), [deal people](../../packages/features/deal-people/src/schema.ts).

## User experience

1. In Deal → People, open a seller or partner and choose **Interests & priorities**. Add an initial interest with a source, or leave it unknown. Assign a relationship owner, defaulting to the selected deal manager. Never invent a profile to fill an empty state.
2. When scheduling a meeting, select the actual people attending. Show **Meeting brief** with its generation time, review state, and regeneration control. A missing attendee mapping is a visible task, not a name-based guess.
3. Before the meeting, the owner receives an internal notification linking to the brief. The owner can edit proposed topics, exclude an inappropriate topic, and mark the brief reviewed.
4. During or after the meeting, use **Log interests** to capture a statement, speaker, source and optional timestamp. Mark which planned questions were answered, deferred, or not discussed. A recording is optional.
5. Once notes or a transcript are ready, the workflow creates a candidate review. The owner sees each proposed change beside its evidence and existing profile, then accepts, edits, rejects, or defers it.
6. Saving the review updates approved interests, creates agreed follow-up actions, and marks affected briefs outdated. The next meeting starts from the updated profile.

## Interest and evidence model

Proposed tables are projections of domain events unless noted otherwise. Every record carries `account_id`, `deal_id`, timestamps, and actor/provenance information. Foreign references must resolve to the same account and deal.

| Record | Required information |
| --- | --- |
| `deal_interest_person` | Stable ID, existing contact ID or user ID, relationship role, owner; explicit aliases linking duplicate representations of the same person |
| `meeting_source_revision` | Meeting ID, revision, source kind, immutable text snapshot or controlled object reference, content hash, author, captured/observed time, readiness state |
| `meeting_speaker_mapping` | Meeting/source revision, speaker label, person ID, mapping reviewer and timestamp; unresolved labels remain unresolved |
| `relationship_interest` | Person ID, category, concise claim, priority (`unknown/low/medium/high`), lifecycle (`active/disputed/superseded/archived`), validation level, last supported/confirmed dates, next review date, current version |
| `interest_evidence` | Interest or candidate ID, source revision, meeting ID, exact excerpt and character offsets, optional recording timestamp, speaker mapping, direct/secondhand/inferred classification, supports/contradicts relation |
| `interest_review_batch` and candidates | Meeting/source revision, extraction version, proposed create/support/change/dispute action, target interest/version, candidate claim, evidence, decision, editor/reviewer, rationale and review time |
| `meeting_brief` | Meeting ID, immutable revision, attendee IDs, source/profile versions, structured sections, generated time, draft/reviewed/outdated state, reviewer and workflow run ID |

Categories: deal objectives; economics; timing; staff/clients; legacy/identity; transition/future role; communication preferences; personal/professional conversation topics. Unknown priority stays unknown unless explicitly reviewed. Inferred significance must be labelled as such.

Validation level is separate from lifecycle:

- `proposed`: extraction or manual candidate awaiting review; excluded from established facts.
- `team_reviewed`: a human verified attribution and source support; this does not mean the subject confirmed it.
- `subject_confirmed`: attributable evidence shows the person explicitly stated or reaffirmed the claim; a reviewer confirms that evidence.

Freshness is derived from `next_review_at`, independently of validation level. Default review intervals: 30 days for deal priorities and 180 days for conversation topics, configurable by the team. A new contradiction makes the claim disputed immediately. Silence, a nod, AI confidence, or repeated copies of the same transcript do not constitute confirmation.

For example, “Pat said protecting the team is essential” can be subject-confirmed when Pat is mapped to the quoted speaker. “The broker thinks Pat wants to retire” is secondhand, at most team-reviewed, and prompts a question to Pat.

## Workflow A: capture and validate after a meeting

Template: **Learn seller and partner interests**. Trigger on proposed `meeting.interest_sources_ready`, emitted only after a usable source revision is explicitly submitted. Merely setting status to held must not imply a transcript exists. A manual “Process notes” action emits the same event and uses the same deduplication rules.

```text
Sources ready → Load context → Extract candidates → Validate evidence → Save review batch
  → Branch: candidates exist?
      yes → Create review todo → Notify owner → End
      no  → Record no supported changes → End

Review submitted → Apply reviewed changes atomically → Invalidate briefs
  → Create approved follow-ups → Notify owner → End
```

The review is durable domain state; it does not keep a workflow sleeping indefinitely. A second event-triggered run handles submission. Generic workflow approval may gate whether to start extraction or require additional approval, but cannot substitute for editing and deciding individual claims.

Extraction receives only the selected meeting source revision, mapped people, relevant existing interests and meeting questions. Require structured candidates with person ID, proposed operation, category, claim, classification, evidence offsets and optional follow-up question. Treat source text as data, including any instructions embedded in it. The model cannot approve candidates, assign permissions, or write profile state.

Server validation before saving candidates must:

1. Check schema, lengths, allowed categories, account/deal/person membership, and allowed target interest IDs.
2. Verify each quoted excerpt against the exact source revision and offsets. A summary alone cannot prove what a speaker said; trace it to original notes or transcript.
3. Require a reviewed speaker mapping for attribution. Unresolved speakers and secondhand claims remain clarification items until mapped or reviewed with supporting evidence.
4. Detect equivalent existing interests and attach corroborating evidence rather than creating duplicates. AI may suggest matches; ambiguous matches require review.
5. Flag conflicting claims for side-by-side review. Never overwrite an old claim simply because a new statement is newer.

Reviewer actions: accept a new claim, attach evidence to an existing claim, edit while preserving source support, mark disputed, supersede with a linked replacement, reject with reason, or defer with a question and owner. Acceptance requires verified evidence and person identity. Edits that materially change the claim require fresh source validation. The reviewer may accept only part of a batch. Deferred items stay open; submitted batches record every item's disposition.

`subject_confirmed` requires a cited direct statement or a recorded manual confirmation with author, date and meeting/source reference. “Team reviewed” is the default for accepted secondhand evidence. Confirmation of one interest never validates all interests for that person.

## Workflow B: prepare the next meeting

Template: **Prepare seller/partner meeting brief**. Use an hourly schedule to find scheduled meetings within the next 24 hours, plus a manual trigger for immediate preparation. This fits the existing schedule primitive and avoids introducing per-meeting cron semantics. A new meeting inside the preparation window becomes eligible at the next scan; manual generation is available immediately.

```text
Hourly/manual → Find eligible meetings → Loop each meeting
  → Load participants, interests, evidence, previous outcomes and open actions
  → Build brief → Validate references → Save revision → Notify owner
```

The finder produces only meetings whose attendee, schedule, profile or source version changed since the latest brief, or which have no brief. It excludes cancelled/skipped/held meetings and rechecks status before saving or notifying. Rescheduling invalidates the prior preparation window and brief. Notifications are internal and deduplicated by brief revision; cap automatic notifications to one per meeting per day, with manual refresh always available.

Brief contents, in reading order:

1. Meeting objective, time, attendees, relationship owners and preparation gaps.
2. Per-person top priorities, with validation label, evidence link, last confirmation and freshness. Do not combine different partners' priorities into a single seller position.
3. Changes since the previous meeting, disputes and stale claims needing reconfirmation.
4. Two or three useful conversation topics from approved evidence, explaining relevance without implying a personal relationship that does not exist.
5. Suggested questions tied to unconfirmed priorities or prior promises; clearly label hypotheses and unknowns.
6. Open commitments/actions with owner, due date and status, plus source links.

Keep the main brief to approximately one screen, with expandable evidence. A generated brief is a draft until reviewed. Proposed interests appear only in a separately labelled “Questions to validate” section. If no reliable interests exist, show that gap and offer neutral discovery questions. Never manufacture an icebreaker.

## Workflow integration contracts

All names below are proposed. Add them to graph validation, editor palette/output schemas, registry, worker activity wiring and tests as applicable; publish new workflow versions without mutating existing published graphs.

| Capability | Contract and effect |
| --- | --- |
| Meeting event context | Extend typed event output with optional `meetingId`, `sourceRevisionId` and `reviewBatchId`, derived server-side from validated event metadata; preserve existing fields |
| `load_relationship_context` | Validated meeting/person inputs → bounded sources, reviewed speaker mappings, interests/versions, open actions and participant gaps; permission-checked read |
| `extract_interest_candidates` | Wrap AI extraction in strict domain output validation; save nothing until source/evidence checks pass; return validated candidates and diagnostics |
| `save_interest_review` | Context revision + validated candidates → persisted batch ID/review URL; idempotent domain command |
| `apply_interest_review` | Submitted batch + expected profile versions → atomic evidence/interest events; reject stale decisions and request renewed review |
| `find_meetings_for_briefs` | Account + current time + preparation window → bounded eligible meeting IDs, with pagination and a watermark |
| `build_meeting_brief` | Authorized context → schema-validated brief with resolvable source and interest IDs; use deterministic formatting if AI is unavailable |
| `save_meeting_brief` | Brief + expected context fingerprint → immutable revision or existing matching revision; refuse stale context |

Reuse existing `create_todo`, `notify_team`, `loop` and branching nodes. Extraction and brief steps use the existing team AI provider, cancellation, timeout and budget mechanisms. Do not expose arbitrary SQL or unrestricted write nodes to make these templates work.

Proposed events: `meeting.interest_sources_ready`, `relationship_interest.review_submitted`, `relationship_interest.created`, `relationship_interest.evidence_added`, `relationship_interest.validation_changed`, `relationship_interest.disputed`, `relationship_interest.superseded`, `relationship_interest.archived`, and `meeting_brief.generated/reviewed/invalidated`. Register required trigger types explicitly; existing `meeting.scheduled/updated` are not currently in the builder trigger allowlist. Source-ready and review-submitted events carry meeting and revision/batch IDs, not raw transcripts.

Domain commands validate authorization and append events/project affected rows in one transaction. Review submission freezes its decisions and emits its event atomically. Applying a batch atomically marks it applied; a failed downstream notification cannot undo an approved profile change.

## Reliability, access and operations

- Source extraction key: `(account, meeting, source revision, extraction version)`. Applying key: submitted review batch ID. Brief key: `(meeting, attendee/schedule/profile/source fingerprint, template version)`. Enforce database uniqueness in addition to workflow-run deduplication.
- A transcript correction creates a new source revision. Preserve old evidence, mark affected claims for re-review, and invalidate dependent briefs. Repeated processing of the same revision creates neither duplicate interests nor tasks.
- Use expected versions on review application and brief save. Concurrent changes require reconciliation; never silently apply an old review over a newer profile.
- Missing notes/transcripts create a capture task. Missing identity mappings create a mapping task. AI failure leaves existing profiles unchanged and supports retry/manual entry. No-candidate extraction is a successful result, not evidence that the person has no interests.
- Deduplicate review tasks by batch and follow-ups by accepted action ID. Create meeting action items only for commitments explicitly accepted by a reviewer; suggested questions are preparation items. Follow-ups retain source references and link to existing meeting action items where applicable.
- Require `deals.manage` for profile reads/writes and review in MVP, alongside account membership and workflow-management checks where applicable. Background execution revalidates account/deal authorization. External seller/counsel/lender rooms receive no access to these profiles, evidence or briefs by default.
- Enforce tenancy through RLS, composite ownership checks and storage authorization, including direct URL requests. Store source references in workflow logs instead of full transcripts; ensure AI inputs and step outputs follow retention and access rules for meeting material.
- Capture volunteered, relevant details. Exclude inferred sensitive traits and unnecessary personal details from extraction and briefs. Archiving hides an interest from new briefs; source deletion/redaction must also remove or redact copied excerpts, generated brief content and retained AI/workflow payloads under the chosen retention policy. An audit can retain action metadata without retaining removed personal text.
- Log who captured, extracted, reviewed, confirmed, superseded and generated each item, with workflow/prompt/model versions. Record failures and validation reasons without dumping source text into operational logs.

## Example end-to-end

Before a meeting with two selling partners, Jamie's profile says staff continuity matters (subject-confirmed, cited last week). Morgan's retirement timing is only broker-reported (team-reviewed). The brief keeps those separate and suggests asking Morgan about the desired transition period.

During the meeting Morgan says, “I'd like to stay involved two days a week for the first year.” The transcript is submitted, Morgan's speaker mapping is reviewed, and extraction proposes a transition-role interest with a precise citation. The owner accepts it as subject-confirmed and supersedes the incompatible retirement assumption, retaining its history. A question about client handoffs becomes an owned follow-up only after review. The next brief shows Morgan's stated role and the open handoff question.

If the speaker is unknown, the same quote stays unresolved. If the transcript later changes, the supporting interest is flagged for review and the brief becomes outdated.

## Delivery sequence and acceptance criteria

Phase 1: identity mapping, source revisions, event-backed interests/evidence/reviews, manual capture and deterministic manual briefs. This provides value before AI automation.

Phase 2: typed workflow steps and trigger context, extraction/review template, scheduled preparation template, notifications and idempotency.

Phase 3: freshness reminders, improved matching, editable briefing templates and reporting. Cross-deal profiles require a separate scope and access design.

Required acceptance checks:

1. Two partners with conflicting priorities appear separately, with correct identities and citations.
2. A held meeting without a transcript can be processed from authored notes; a held meeting without either creates a capture task and no claims.
3. Unknown speakers, fabricated excerpts, unsupported edits and cross-deal IDs cannot become accepted facts.
4. A reviewed secondhand claim remains labelled secondhand; a direct, attributed confirmation can change its validation level with audit evidence.
5. Reviewer acceptance, editing, partial rejection, deferral and supersession preserve source and decision history.
6. Duplicate events/retries create one batch, one applied change and one task per intended action; concurrency detects stale versions.
7. Schedule changes, cancellations, transcript corrections and profile updates invalidate or suppress the correct briefs; recurring meetings have separate occurrence briefs.
8. AI failure, budget pause and workflow cancellation leave approved records intact and permit manual completion.
9. Unauthorized team members and external participants cannot read interests, briefs, evidence or source objects, including through guessed IDs and notification links.
10. The brief's facts resolve to approved records; hypotheses and stale/disputed claims are visibly labelled; an empty profile produces discovery questions without invented topics.

Track processing and preparation success rates, time to human review, evidence-validation failures, candidate acceptance/edit/rejection rates, overdue review tasks, and the share of upcoming meetings with current reviewed briefs. Candidate acceptance is a quality diagnostic, never an incentive to approve unsupported claims.

Product decisions to confirm before implementation: whether “partner” also includes referral/channel relationships outside deals; default preparation window and freshness intervals; whether briefing needs a distinct internal permission; and the account's source/AI retention policy. The MVP defaults above let design and engineering estimation proceed.
