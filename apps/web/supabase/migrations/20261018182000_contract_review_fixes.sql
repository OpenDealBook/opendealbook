-- A version's side and number are fixed when it is added, the seller side
-- dates a version by when it was shown to them, and a reply is seen only
-- with the thread it belongs to.

revoke update (party, version) on public.contract_version from authenticated;

drop policy if exists contract_comment_read on public.contract_comment;
drop function if exists public.seller_side_contract_version(uuid);
drop function if exists public.seller_side_contracts(uuid);
drop function if exists public.seller_side_contract_versions(uuid);

create or replace function public.seller_side_contract_versions(deal_id uuid)
  returns table (
    id uuid,
    contract_id uuid,
    version int,
    party text,
    change_summary text,
    is_signed boolean,
    shown_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select v.id, v.contract_id, v.seller_number,
    v.party, v.change_summary, v.is_signed,
    case when v.party = 'seller' then v.created_at else v.shared_at end
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where c.deal_id = seller_side_contract_versions.deal_id
    and (v.shared_at is not null or v.party = 'seller')
    and public.reads_contracts_as_seller_side(c.deal_id)
  order by c.created_at, c.id, v.seller_number;
$$;

revoke all on function public.seller_side_contract_versions(uuid) from public, anon;
grant execute on function public.seller_side_contract_versions(uuid) to authenticated, service_role;

create or replace function public.seller_side_contracts(deal_id uuid)
  returns table (id uuid, type text, current_version int)
  language sql stable security definer
  set search_path = '' as $$
  select c.id, c.type, max(v.version)
  from public.contract c
  join public.seller_side_contract_versions(seller_side_contracts.deal_id) v on v.contract_id = c.id
  group by c.id, c.type, c.created_at
  order by c.created_at, c.id;
$$;

revoke all on function public.seller_side_contracts(uuid) from public, anon;
grant execute on function public.seller_side_contracts(uuid) to authenticated, service_role;

-- One version the seller side can see, with what a comment on it needs.
-- shown_since is when the team shared it; the seller side's own versions
-- have none, as they saw them from the start.
create or replace function public.seller_side_contract_version(contract_version_id uuid)
  returns table (account_id uuid, deal_id uuid, shown_since timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select c.account_id, c.deal_id, case when v.party = 'seller' then null else v.shared_at end
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where v.id = seller_side_contract_version.contract_version_id
    and exists (
      select 1 from public.seller_side_contract_versions(c.deal_id) s
      where s.id = v.id
    );
$$;

revoke all on function public.seller_side_contract_version(uuid) from public, anon;
grant execute on function public.seller_side_contract_version(uuid) to authenticated, service_role;

-- When the thread a comment sits in was started: its root comment's time.
create or replace function public.contract_comment_thread_started_at(comment_id uuid)
  returns timestamptz
  language sql stable security definer
  set search_path = '' as $$
  with recursive thread as (
    select c.id, c.parent_id, c.created_at
    from public.contract_comment c
    where c.id = contract_comment_thread_started_at.comment_id
    union all
    select p.id, p.parent_id, p.created_at
    from public.contract_comment p
    join thread t on p.id = t.parent_id
  )
  select t.created_at from thread t where t.parent_id is null;
$$;

revoke all on function public.contract_comment_thread_started_at(uuid) from public, anon;
grant execute on function public.contract_comment_thread_started_at(uuid) to authenticated, service_role;

-- What of a comment's thread the seller side may read: a version shown to
-- them, and only threads started since the team shared it.
create or replace function public.seller_side_reads_contract_comment(
  comment_id uuid,
  contract_version_id uuid,
  created_at timestamptz
)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.seller_side_contract_version(seller_side_reads_contract_comment.contract_version_id) s
    where s.shown_since is null
      or (
        seller_side_reads_contract_comment.created_at >= s.shown_since
        and public.contract_comment_thread_started_at(seller_side_reads_contract_comment.comment_id) >= s.shown_since
      )
  );
$$;

revoke all on function public.seller_side_reads_contract_comment(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.seller_side_reads_contract_comment(uuid, uuid, timestamptz) to authenticated, service_role;

create policy contract_comment_read on public.contract_comment
  for select to authenticated
  using (
    (
      exists (select 1 from public.contract_version v where v.id = contract_version_id)
      or public.seller_side_reads_contract_comment(id, contract_version_id, created_at)
    )
    and (
      not internal
      or public.has_role_on_account(account_id)
      or public.is_deal_counsel(
        (select c.deal_id
         from public.contract_version v
         join public.contract c on c.id = v.contract_id
         where v.id = contract_version_id),
        'buyer'
      )
    )
  );

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
      or public.seller_side_reads_contract_comment(cc.id, cc.contract_version_id, cc.created_at)
    )
    and (
      not cc.internal
      or public.has_role_on_account(cc.account_id)
      or public.is_deal_counsel(c.deal_id, 'buyer')
    );
$$;

revoke all on function public.contract_comment_authors(uuid[]) from public, anon;
grant execute on function public.contract_comment_authors(uuid[]) to authenticated, service_role;
