drop policy personal_todo_read on public.personal_todo;
drop policy personal_todo_insert on public.personal_todo;
drop policy personal_todo_update on public.personal_todo;
drop policy personal_todo_delete on public.personal_todo;

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
