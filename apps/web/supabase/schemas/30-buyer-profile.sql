-- Account-scoped buyer marketing profile. Versions are kept: a new version is a
-- new row rather than an overwrite, so the current profile is the max version.
-- sensitive_json holds opt-in fields (credit score, pre-approval, phone) and is
-- only populated when include_sensitive; that gating is enforced by the feature
-- layer, not the database.

create table if not exists public.buyer_profile (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  display_name text,
  headline text,
  about text,
  expertise_json jsonb,
  financing_json jsonb,
  contact_json jsonb,
  target_statement text,
  motivation text,
  interested_json jsonb,
  not_interested_json jsonb,
  value_proposition text,
  experience text,
  photo_path text,
  include_sensitive boolean not null default false,
  sensitive_json jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, version)
);

alter table public.buyer_profile enable row level security;

create index ix_buyer_profile_account on public.buyer_profile (account_id);

revoke all on public.buyer_profile from authenticated, service_role;
grant select, insert, update, delete on public.buyer_profile to authenticated;
grant select, insert, update, delete on public.buyer_profile to service_role;

create trigger buyer_profile_timestamps
  before insert or update on public.buyer_profile
  for each row execute function public.set_timestamps();

create trigger buyer_profile_user_tracking
  before insert or update on public.buyer_profile
  for each row execute function public.set_user_tracking();

create policy buyer_profile_read on public.buyer_profile
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy buyer_profile_insert on public.buyer_profile
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy buyer_profile_update on public.buyer_profile
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy buyer_profile_delete on public.buyer_profile
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- Latest version row for an account. Runs as the invoker, so buyer_profile RLS
-- decides what the caller can see.
create or replace function public.current_buyer_profile(account_id uuid)
  returns public.buyer_profile
  language sql
  stable
  set search_path = '' as $$
  select bp.*
  from public.buyer_profile bp
  where bp.account_id = current_buyer_profile.account_id
  order by bp.version desc
  limit 1;
$$;

grant execute on function public.current_buyer_profile(uuid) to authenticated, service_role;
