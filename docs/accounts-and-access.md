# Accounts and access

Every tenant is an `accounts` row. All deal data is scoped by `account_id` and enforced by
Row Level Security, so one account never sees another's data.

## Personal vs team accounts

- **Personal account.** Created automatically for each user on sign-up (the
  `on_auth_user_created` trigger provisions it). A personal account has no membership rows;
  the user is its `primary_owner_user_id`.
- **Team account.** Created explicitly (the create-team flow). It has members, roles, and
  invitations, and is addressed in the app by its slug.

The same deal features work in both. The app serves two route groups that mirror each other:
a personal workspace under `home/(user)/...` and a team workspace under `home/[account]/...`.

The primary owner of an account holds every permission on it even with no membership row. This
is handled in `has_role_on_account` and `has_permission` with an explicit
`primary_owner_user_id` branch, which is what makes a personal account (where no membership
exists) fully usable by its owner.

## Roles and permissions

Access is permission-based, not role-string-based. A role grants a set of permissions
(`role_permissions`), and the app always checks a permission, never a role name.

**Permissions** (`app_permissions` enum):

| Permission | Covers |
| --- | --- |
| `roles.manage` | Managing roles |
| `billing.manage` | Billing and subscription |
| `settings.manage` | Account settings |
| `members.manage` | Membership |
| `invites.manage` | Invitations |
| `deals.create` | Creating deals |
| `deals.manage` | Reading and writing deal data |
| `checklists.manage` | Checklists and seller questions |
| `participants.manage` | Granting per-deal access |
| `buyer_profile.manage` | The buyer profile |

**Roles** are the base MakerKit-style `owner` / `admin` / `member` plus a per-tenant deal
hierarchy (lower `hierarchy_level` outranks higher):

| Role | Level | Deal permissions seeded |
| --- | --- | --- |
| `owner` | (primary) | deals.create, deals.manage, checklists.manage, participants.manage, buyer_profile.manage |
| `admin` | (base) | same as owner |
| `deal_lead` | 4 | deals.create, deals.manage, checklists.manage, participants.manage |
| `analyst` | 5 | deals.create, checklists.manage |
| `counsel` | 6 | checklists.manage |
| `external_counsel` | 7 | none at tenant level |
| `seller` | 8 | none at tenant level |
| `broker` | 9 | none at tenant level |
| `viewer` | 10 | none at tenant level |

The external roles (`external_counsel`, `seller`, `broker`, `viewer`) carry no tenant-wide
permissions. They reach a specific deal only through a participant grant.

**Three RLS helpers** gate everything:

- `has_role_on_account(account_id)` - is the caller a member of (or primary owner of) this
  account.
- `has_permission(user_id, account_id, permission)` - does the caller hold a permission on
  this account.
- `has_deal_permission(deal_id, permission)` - does the caller reach this deal, either through
  account membership or through a `deal_participant` grant.

## External participants, including sellers

Internal members reach a deal through their account role. Everyone else reaches a single deal
through a `deal_participant` row:

- `party` is one of `buyer`, `seller`, `broker`, `lender`.
- `scope` is `deal`, `contract`, `data_room_folder`, or `checklist`, with an optional
  `scope_id` naming the scoped object when the grant is narrower than the whole deal.
- `permission` is `view`, `comment`, `suggest`, `edit`, or `sign`.
- `expires_at` can time-box the grant.

A **seller** is a real authenticated user with a `deal_participant` row where `party = 'seller'`
(there is no token or magic-link path). That grant is what lets a seller answer diligence
questions through the seller portal and view what is shared with them, and nothing else. Buyer
side-channel notes are deliberately kept in a separate table the seller can never read; see
[Due diligence](due-diligence.md).

Participant grants are written through the deal event store, like other deal writes; see
[Architecture](architecture.md).
