# Checklists and todos

## Template-driven checklists

A deal's work is tracked as checklist items. Items come from account-level templates and can
also be added by hand.

- **Template kinds.** A `checklist_template` has a `kind` of `offer`, `diligence`, `closing`,
  or `post_close`. Broadly, offer items support LOI preparation, diligence items the due
  diligence stage, closing items the purchase-agreement close, and post-close items the
  announcement and integration stages.
- **Apply a template.** An "Apply checklist template" control copies a template's items onto
  the deal. HR audit is modeled as a diligence category rather than a separate kind.
- **Add an item.** Items can also be added to a deal one at a time.
- **Four-status model.** Every checklist item uses the one status enum used across the system:
  `not_started`, `requested`, `received`, `reviewed`. A reviewed item can carry an outcome
  (`accepted`, `follow_up`, `rejected`).
- Items can carry a category, importance, owner role, assignee, due offset, and a link to an
  offer term, and can be tied to a diligence schedule week.

Checklist items are written through the deal event store and projected, so the full history of
each item (added, status changed, rescheduled, assigned, removed) is part of the deal's audit
log. See [Architecture](architecture.md). Checklist writes are gated on `checklists.manage`.

## The per-user todo list

Alongside deal checklists, each user has a personal todo view that combines two sources:

- **Assigned checklist items.** Checklist items across the user's deals that are assigned to
  them.
- **Free-form personal todos.** A per-deal personal list stored in `personal_todo`
  (user-scoped, owner-only, account-scoped), for a user's own reminders that are not formal
  checklist items.

Two surfaces present this:

- **My Todos** (`/home/.../todos`) is the cross-deal aggregation: the user's assigned checklist
  items from every deal, together with their personal todos.
- **Per-deal todos** (`/home/.../deals/[id]/todos`) shows one deal's full checklist plus the
  user's free-form todos for that deal.
