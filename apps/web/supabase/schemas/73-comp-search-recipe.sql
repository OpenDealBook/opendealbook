-- A saved comp-search definition owned by a tenant. criteria holds the filter
-- set a search runs against the comp corpus.

create table if not exists public.comp_search_recipe (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.comp_search_recipe enable row level security;

create index ix_comp_search_recipe_account on public.comp_search_recipe (account_id);

revoke all on public.comp_search_recipe from authenticated, service_role;
grant select on public.comp_search_recipe to authenticated;
grant select, insert, update, delete on public.comp_search_recipe to service_role;

create trigger comp_search_recipe_timestamps
  before insert or update on public.comp_search_recipe
  for each row execute function public.set_timestamps();

create policy comp_search_recipe_read on public.comp_search_recipe
  for select to authenticated
  using (public.has_role_on_account(account_id));
