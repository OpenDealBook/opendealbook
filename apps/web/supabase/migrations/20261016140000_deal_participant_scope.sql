-- Compiled from supabase/schemas/24-deal-access.sql and 49-seller-question.sql.

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

create or replace function public.seller_deal_header(deal_id uuid)
  returns table (id uuid, description text, stage text)
  language sql stable security definer
  set search_path = '' as $$
  select d.id, d.description, d.stage
  from public.deal d
  where d.id = seller_deal_header.deal_id
    and public.is_deal_seller(seller_deal_header.deal_id);
$$;

revoke all on function public.seller_deal_header(uuid) from public, anon;
grant execute on function public.seller_deal_header(uuid) to authenticated, service_role;

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

alter policy deal_participant_read on public.deal_participant
  using (
    public.has_role_on_account((select account_id from public.deal where id = deal_id))
    or public.has_deal_permission(deal_id, 'participants.manage')
    or user_id = (select auth.uid())
  );

alter policy seller_question_read on public.seller_question
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'checklists.manage')
    or public.is_deal_seller(deal_id)
  );
