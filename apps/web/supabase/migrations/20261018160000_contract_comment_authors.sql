-- Counsel and sellers cannot read the team's accounts, so who wrote a comment
-- comes from here. The visibility clause mirrors contract_comment_read, as a
-- definer does not run under it.
create or replace function public.contract_comment_authors(contract_version_ids uuid[])
  returns table (comment_id uuid, author_name text, author_role text)
  language sql stable security definer
  set search_path = '' as $$
  select cc.id,
    coalesce(dc.name, m.name, a.name::text),
    case
      when cc.author_side = 'buyer' and exists (
        select 1 from public.accounts_memberships am
        where am.account_id = cc.account_id and am.user_id = cc.author_user_id
      ) then 'team'
      when cc.author_side = 'buyer' then 'buyer_counsel'
      when dc.id is not null then 'seller_counsel'
      else 'seller'
    end
  from public.contract_comment cc
  join public.contract_version v on v.id = cc.contract_version_id
  join public.contract c on c.id = v.contract_id
  left join public.deal_counsel dc
    on dc.deal_id = c.deal_id and dc.side = cc.author_side and dc.user_id = cc.author_user_id
  left join public.seller_room r on r.deal_id = c.deal_id and cc.author_side = 'seller'
  left join public.seller_room_member m on m.room_id = r.id and m.user_id = cc.author_user_id
  left join public.accounts a on a.primary_owner_user_id = cc.author_user_id and a.is_personal_account
  where cc.contract_version_id = any (contract_comment_authors.contract_version_ids)
    and (
      public.has_role_on_account(cc.account_id)
      or public.has_deal_permission(c.deal_id, 'deals.manage')
      or public.is_deal_counsel(c.deal_id, 'buyer')
      or exists (
        select 1 from public.seller_side_contract_version(cc.contract_version_id) s
        where s.shown_since is null or cc.created_at >= s.shown_since
      )
    )
    and (
      not cc.internal
      or public.has_role_on_account(cc.account_id)
      or public.is_deal_counsel(c.deal_id, 'buyer')
    );
$$;

revoke all on function public.contract_comment_authors(uuid[]) from public, anon;
grant execute on function public.contract_comment_authors(uuid[]) to authenticated, service_role;
