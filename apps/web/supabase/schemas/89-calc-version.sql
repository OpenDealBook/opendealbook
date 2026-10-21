-- A saved calculator scenario for a deal. Many versions per deal: each is a
-- scratch what-if the account keeps alongside the others, one flagged primary.
-- type selects which calculator shape the version holds (sde, deal, or working
-- capital). outputs_snapshot captures the key computed outputs at save time so a
-- version reads back without re-running the calculator. Conventional RLS; these
-- are scratch scenarios, not event-sourced.

create table if not exists public.calc_version (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  type text check (type in ('sde', 'deal', 'working_capital')),
  name text,
  notes text,
  is_primary boolean not null default false,
  outputs_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.calc_version enable row level security;

create index ix_calc_version_deal on public.calc_version (deal_id);
create index ix_calc_version_deal_type on public.calc_version (deal_id, type);

revoke all on public.calc_version from authenticated, service_role;
grant select, insert, update, delete on public.calc_version to authenticated;
grant select, insert, update, delete on public.calc_version to service_role;

create trigger calc_version_timestamps
  before insert or update on public.calc_version
  for each row execute function public.set_timestamps();

create trigger calc_version_user_tracking
  before insert or update on public.calc_version
  for each row execute function public.set_user_tracking();

-- Choosing the primary version is the deal managers' call; deal work edits
-- everything else. The service role is let through.
create or replace function public.refuse_primary_calc_change_without_manage()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if (select auth.uid()) is not null
    and new.is_primary is distinct from (case when tg_op = 'UPDATE' then old.is_primary else false end)
    and not public.has_permission((select auth.uid()), new.account_id, 'deals.manage') then
    raise exception 'choosing the primary calculator needs deals.manage' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger calc_version_primary_needs_manage
  before insert or update of is_primary on public.calc_version
  for each row execute function public.refuse_primary_calc_change_without_manage();

create policy calc_version_read on public.calc_version
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy calc_version_insert on public.calc_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

create policy calc_version_update on public.calc_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.work'));

-- Deal workers delete only their own scratch versions; the primary and the
-- adopted one are shared, so only the deal's managers delete those.
create policy calc_version_delete on public.calc_version
  for delete to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    or (
      public.has_permission((select auth.uid()), account_id, 'deals.work')
      and created_by = (select auth.uid())
      and not is_primary
      and not exists (
        select 1 from public.deal_financials f where f.source_calc_version_id = calc_version.id
      )
    )
  );

-- The deferred link from deal_financials (86) back to the calc version a deal's
-- adopted figures came from. Declared here, not inline in 86, because schema
-- files apply in filename order and calc_version does not exist until this file.
alter table public.deal_financials
  add constraint deal_financials_source_calc_version_fk
  foreign key (source_calc_version_id) references public.calc_version (id) on delete set null;
