-- A personal star: one user flagging one deal as a favorite. Stars are private to
-- the user who sets them, so there is no shared or account-wide view of who
-- starred what. account_id scopes the row to the deal's tenant so RLS can require
-- both own-row ownership and account membership. A star is set or cleared, never
-- edited, so the table is insert and delete only.

create table if not exists public.deal_star (
  user_id uuid not null references auth.users (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);

alter table public.deal_star enable row level security;

create index ix_deal_star_deal on public.deal_star (deal_id);

revoke all on public.deal_star from authenticated, service_role;
grant select, insert, delete on public.deal_star to authenticated;
grant select, insert, delete on public.deal_star to service_role;

create policy deal_star_read on public.deal_star
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_role_on_account(account_id)
  );

create policy deal_star_insert on public.deal_star
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_role_on_account(account_id)
  );

create policy deal_star_delete on public.deal_star
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_role_on_account(account_id)
  );
