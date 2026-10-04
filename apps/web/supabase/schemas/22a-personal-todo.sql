-- A member's private to-do, optionally pinned to a deal. Owner-scoped: a row is
-- visible and writable only by the user who owns it, and only within an account
-- they belong to. deal_id is nullable so a todo can be account-wide or attached
-- to a specific deal; the (user_id, deal_id) index serves the per-deal list.

create table if not exists public.personal_todo (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users,
  title text not null,
  done boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.personal_todo enable row level security;

create index ix_personal_todo_user_deal on public.personal_todo (user_id, deal_id);

revoke all on public.personal_todo from authenticated, service_role;
grant select, insert, update, delete on public.personal_todo to authenticated;
grant select, insert, update, delete on public.personal_todo to service_role;

create trigger personal_todo_timestamps
  before insert or update on public.personal_todo
  for each row execute function public.set_timestamps();

create trigger personal_todo_user_tracking
  before insert or update on public.personal_todo
  for each row execute function public.set_user_tracking();

create policy personal_todo_read on public.personal_todo
  for select to authenticated
  using (user_id = (select auth.uid()) and public.has_role_on_account(account_id));

create policy personal_todo_insert on public.personal_todo
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_role_on_account(account_id));

create policy personal_todo_update on public.personal_todo
  for update to authenticated
  using (user_id = (select auth.uid()) and public.has_role_on_account(account_id))
  with check (user_id = (select auth.uid()) and public.has_role_on_account(account_id));

create policy personal_todo_delete on public.personal_todo
  for delete to authenticated
  using (user_id = (select auth.uid()) and public.has_role_on_account(account_id));
