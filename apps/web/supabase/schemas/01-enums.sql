-- Domain enums shared across the schema.

create type public.app_permissions as enum (
  'roles.manage',
  'billing.manage',
  'settings.manage',
  'members.manage',
  'invites.manage',
  'deals.create',
  'deals.manage',
  'checklists.manage',
  'participants.manage'
);

create type public.billing_provider as enum ('stripe', 'lemon-squeezy', 'paddle');

create type public.subscription_status as enum (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused'
);

create type public.subscription_item_type as enum ('flat', 'per_seat', 'metered');

create type public.payment_status as enum ('pending', 'succeeded', 'failed');

create type public.notification_type as enum ('info', 'warning', 'error');

create type public.notification_channel as enum ('in_app', 'email');

-- Tuple used by bulk invitation helpers so an array of (email, role) pairs can
-- be passed as a single argument.
create type public.invitation as (email text, role varchar(50));
