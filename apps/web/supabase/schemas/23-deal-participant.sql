-- Per-deal access grants for internal and external parties. A grant scoped
-- narrower than the whole deal names the scoped object in scope_id.
-- Policies live in 24-deal-access.sql because they depend on has_deal_permission.

create table if not exists public.deal_participant (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  party public.participant_party not null,
  role text,
  scope public.participant_scope not null default 'deal',
  scope_id uuid,
  permission public.participant_permission not null default 'view',
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.deal_participant enable row level security;

create index ix_deal_participant_deal on public.deal_participant (deal_id);
create index ix_deal_participant_user on public.deal_participant (user_id);

-- Writes go through append_deal_event; the projectors run security definer as
-- the table owner. authenticated and service_role keep read only.
revoke all on public.deal_participant from authenticated, service_role;
grant select on public.deal_participant to authenticated;
grant select on public.deal_participant to service_role;

create trigger deal_participant_timestamps
  before insert or update on public.deal_participant
  for each row execute function public.set_timestamps();
