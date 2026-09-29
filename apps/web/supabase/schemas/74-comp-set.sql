-- A curated collection of comps and its members. A member links a comp into a
-- set; the set carries the tenant ownership, so a member's visibility follows
-- the set it belongs to.

create table if not exists public.comp_set (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_set enable row level security;

create index ix_comp_set_account on public.comp_set (account_id);

revoke all on public.comp_set from authenticated, service_role;
grant select on public.comp_set to authenticated;
grant select, insert, update, delete on public.comp_set to service_role;

create trigger comp_set_timestamps
  before insert or update on public.comp_set
  for each row execute function public.set_timestamps();

create policy comp_set_read on public.comp_set
  for select to authenticated
  using (public.has_role_on_account(account_id));

create table if not exists public.comp_set_member (
  id uuid primary key default gen_random_uuid(),
  comp_set_id uuid not null references public.comp_set (id) on delete cascade,
  comp_id uuid not null references public.comp (id) on delete cascade,
  created_at timestamptz,
  created_by uuid references auth.users,
  unique (comp_set_id, comp_id)
);

alter table public.comp_set_member enable row level security;

create index ix_comp_set_member_set on public.comp_set_member (comp_set_id);

revoke all on public.comp_set_member from authenticated, service_role;
grant select on public.comp_set_member to authenticated;
grant select, insert, update, delete on public.comp_set_member to service_role;

create policy comp_set_member_read on public.comp_set_member
  for select to authenticated
  using (
    exists (
      select 1 from public.comp_set s
      where s.id = comp_set_id and public.has_role_on_account(s.account_id)
    )
  );
