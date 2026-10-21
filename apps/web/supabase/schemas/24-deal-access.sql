-- Deal-scoped access. has_deal_permission holds only for an internal member of
-- the deal's account holding the tenant permission. A deal_participant grant
-- never confers a tenant permission; the reads a seller participant needs are
-- the explicit seller paths below.

create or replace function public.has_deal_permission(deal_id uuid, permission text)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal d
    where d.id = has_deal_permission.deal_id
      and public.has_permission((select auth.uid()), d.account_id, has_deal_permission.permission::public.app_permissions)
  );
$$;

grant execute on function public.has_deal_permission(uuid, text) to authenticated, service_role;

create or replace function public.is_deal_seller(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal_participant dp
    where dp.deal_id = is_deal_seller.deal_id
      and dp.user_id = (select auth.uid())
      and dp.party = 'seller'
      and (dp.expires_at is null or dp.expires_at > now())
  );
$$;

revoke all on function public.is_deal_seller(uuid) from public, anon;
grant execute on function public.is_deal_seller(uuid) to authenticated, service_role;

-- The seller side never sees the team's own stage names, only these five.
create or replace function public.seller_stage(stage text)
  returns text
  language sql immutable
  set search_path = '' as $$
  select case seller_stage.stage
    when 'sourcing' then 'Talking'
    when 'pre_nda' then 'Talking'
    when 'nda_signed' then 'Talking'
    when 'loi_submitted' then 'LOI'
    when 'loi_accepted' then 'LOI'
    when 'due_diligence' then 'Diligence'
    when 'pa_submitted' then 'Closing'
    when 'pa_accepted' then 'Closing'
    when 'announcement' then 'Closed'
    when 'integration' then 'Closed'
  end;
$$;

grant execute on function public.seller_stage(text) to authenticated, service_role;

-- plpgsql so the body is not checked here: the seller room loads later, in 99e.
create or replace function public.seller_deal_header(deal_id uuid)
  returns table (
    id uuid,
    deal_name text,
    stage text,
    public_stage text,
    contact_name text,
    contact_phone text,
    today date
  )
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select d.id, f.name::text, d.stage,
    case when d.resolution = 'won' then 'Closed' else public.seller_stage(d.stage) end,
    o.name::text, coalesce(nullif(o.phone, ''), nullif(t.team_phone, '')),
    (now() at time zone coalesce(me.timezone, tow.timezone, 'UTC'))::date
  from public.deal d
  join public.accounts t on t.id = d.account_id
  left join public.firm f on f.id = d.firm_id
  left join public.accounts o on o.primary_owner_user_id = d.owner_user_id and o.is_personal_account
  left join public.accounts tow on tow.primary_owner_user_id = t.primary_owner_user_id and tow.is_personal_account
  left join public.accounts me on me.primary_owner_user_id = (select auth.uid()) and me.is_personal_account
  where d.id = seller_deal_header.deal_id
    and (
      public.is_deal_seller(seller_deal_header.deal_id)
      or exists (
        select 1 from public.seller_room r
        where r.deal_id = seller_deal_header.deal_id and public.is_seller_room_member(r.id)
      )
    );
end;
$$;

revoke all on function public.seller_deal_header(uuid) from public, anon;
grant execute on function public.seller_deal_header(uuid) to authenticated, service_role;

-- plpgsql so the body is not checked here: checklist items and the seller room
-- load later.
create or replace function public.seller_waiting_items(deal_id uuid)
  returns table (title text, due_at timestamptz)
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select i.title::text, i.due_at
  from public.checklist_item i
  where i.deal_id = seller_waiting_items.deal_id
    and i.waiting_on = 'seller'
    and i.removed_at is null
    and exists (
      select 1 from public.seller_room r
      where r.deal_id = seller_waiting_items.deal_id and public.is_seller_room_member(r.id)
    )
  order by i.due_at nulls last, i.title;
end;
$$;

revoke all on function public.seller_waiting_items(uuid) from public, anon;
grant execute on function public.seller_waiting_items(uuid) to authenticated, service_role;

create or replace function public.seller_deal_owner(deal_id uuid)
  returns uuid
  language sql stable security definer
  set search_path = '' as $$
  select d.owner_user_id
  from public.deal d
  where d.id = seller_deal_owner.deal_id
    and public.is_deal_seller(seller_deal_owner.deal_id);
$$;

revoke all on function public.seller_deal_owner(uuid) from public, anon;
grant execute on function public.seller_deal_owner(uuid) to authenticated, service_role;

-- plpgsql so the body resolves contract and contract_version at call time;
-- they are defined in later schema files.
create or replace function public.deal_loi_signed(deal_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return exists (
    select 1
    from public.contract c
    join public.contract_version v on v.contract_id = c.id
    where c.deal_id = deal_loi_signed.deal_id
      and c.type = 'loi'
      and v.is_signed
      and (public.is_deal_seller(c.deal_id) or public.has_role_on_account(c.account_id))
  );
end;
$$;

revoke all on function public.deal_loi_signed(uuid) from public, anon;
grant execute on function public.deal_loi_signed(uuid) to authenticated, service_role;

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
    or user_id = (select auth.uid())
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
