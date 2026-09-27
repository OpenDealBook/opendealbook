-- Deal-scoped access. A caller reaches a deal either as an internal member of
-- the deal's account holding the tenant permission, or through an unexpired
-- deal_participant grant. Internal read visibility is account membership;
-- the participant branch is what lets external parties reach a single deal.

create or replace function public.has_deal_permission(deal_id uuid, permission text)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal d
    where d.id = has_deal_permission.deal_id
      and public.has_permission((select auth.uid()), d.account_id, has_deal_permission.permission::public.app_permissions)
  )
  or exists (
    select 1 from public.deal_participant dp
    where dp.deal_id = has_deal_permission.deal_id
      and dp.user_id = (select auth.uid())
      and (dp.expires_at is null or dp.expires_at > now())
  );
$$;

grant execute on function public.has_deal_permission(uuid, text) to authenticated, service_role;

create policy deal_read on public.deal
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(id, 'deals.manage')
  );

create policy deal_insert on public.deal
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.create'));

create policy deal_update on public.deal
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_delete on public.deal
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_participant_read on public.deal_participant
  for select to authenticated
  using (
    public.has_role_on_account((select account_id from public.deal where id = deal_id))
    or public.has_deal_permission(deal_id, 'participants.manage')
  );

create policy deal_participant_insert on public.deal_participant
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'));

create policy deal_participant_update on public.deal_participant
  for update to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'))
  with check (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'));

create policy deal_participant_delete on public.deal_participant
  for delete to authenticated
  using (public.has_permission((select auth.uid()), (select account_id from public.deal where id = deal_id), 'participants.manage'));
