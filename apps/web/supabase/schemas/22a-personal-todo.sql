-- A to-do inside a team, optionally pinned to a deal. user_id is the assignee
-- and created_by the creator; both see and work the row, and the assignee is
-- always someone on the team. deal_id is nullable so a todo can be account-wide
-- or attached to a specific deal; the (user_id, deal_id) index serves the
-- per-deal list.

create table if not exists public.personal_todo (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  done boolean not null default false,
  due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users on delete set null,
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

-- Skipped when a deleted creator's id is nulled out by the foreign key, which
-- set_user_tracking would otherwise put back.
create trigger personal_todo_user_tracking
  before insert or update on public.personal_todo
  for each row when (pg_trigger_depth() = 0) execute function public.set_user_tracking();

create policy personal_todo_read on public.personal_todo
  for select to authenticated
  using ((select auth.uid()) in (user_id, created_by) and public.has_role_on_account(account_id));

create policy personal_todo_insert on public.personal_todo
  for insert to authenticated
  with check (public.is_team_member(account_id, user_id));

create policy personal_todo_update on public.personal_todo
  for update to authenticated
  using ((select auth.uid()) in (user_id, created_by) and public.has_role_on_account(account_id))
  with check (public.is_team_member(account_id, user_id));

create policy personal_todo_delete on public.personal_todo
  for delete to authenticated
  using ((select auth.uid()) in (user_id, created_by) and public.has_role_on_account(account_id));

-- Security definer because handing a to-do away moves it out of the
-- assignee's own read policy, which a plain update must still satisfy.
create or replace function public.assign_personal_todo(todo_id uuid, assignee_id uuid)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.personal_todo t
  set user_id = assignee_id
  where t.id = todo_id
    and (select auth.uid()) in (t.user_id, t.created_by)
    and public.is_team_member(t.account_id, assignee_id);

  if not found then
    raise exception 'Only the creator or assignee can hand this to-do to a teammate'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function public.assign_personal_todo(uuid, uuid) from public, anon;
grant execute on function public.assign_personal_todo(uuid, uuid) to authenticated;
