# Outreach and notifications

## Send-as-user cold outreach

Cold outreach automates the buyer's first contact with an acquisition target. The design is a
single personal email, not a drip:

- **Single touch.** No more than one email per business owner. The engine enforces a
  per-recipient max touches (default 1); it is "basically automating the reachout the user
  would send by hand".
- **Send as the user.** Email goes out from the operator's own Gmail or Microsoft 365 mailbox
  over OAuth, brokered by Nango (`@odb/mailbox` sends via the Nango-resolved token), so replies
  land in the operator's inbox and deliverability is theirs. This is separate from the
  transactional mailer; it does not route through `packages/mailers`.
- **Throttle.** A per-account daily send cap.
- **Suppression.** An opt-out, bounced, manually suppressed, or already-replied recipient is
  never emailed again; the suppression list is honored before every send.
- **Enrollment.** Enroll a `firm` (the email goes to its owner/seller contact) or a standalone
  `contact` that has an email. On send, the firm is marked `contacted`.
- **Templates.** Account-owned sequence templates with merge fields (`{{dot.path | fallback}}`),
  seeded from two informal curiosity-led openers. The engine is a generic sequence engine
  (template, enrollment, timed steps, send, log); cold outreach is its first consumer,
  configured as one step with max-touches 1 and a daily cap.

A throttled Temporal dispatcher (`outreachDispatch`) runs on a schedule: it picks due,
unsuppressed enrollments under the touch cap, up to the remaining daily cap per account,
renders the template, sends through the mailbox, logs the message, and marks the firm
contacted. The engine stays inert until its tables exist and the schedule is started, and the
mailbox send depends on Nango being configured. The reachable UI is at
`/home/[account]/outreach`. See [Configuration](configuration.md).

## Notifications

Deal events are relayed to users through Novu (`@odb/notifications`), gated per user by
`notification_preference`. Notifications fire in both directions where it matters, for example
seller Q&A: the seller is notified when a question is posed and the buyer when it is answered
(see [Due diligence](due-diligence.md)).

A **trial drip** runs as a notification sequence to nurture trial accounts. The generic
outreach sequence engine is built so this kind of nurture can be absorbed into it later.

Novu delivery depends on Novu being configured; email channels are gated so that without a
mailer, email notifications are simply not sent. See [Configuration](configuration.md).
