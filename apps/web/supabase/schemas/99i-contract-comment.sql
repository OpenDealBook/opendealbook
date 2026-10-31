-- Comments on a whole contract version, from the team and both sides' counsel.
-- A comment is seen by whoever can see its version; an internal comment only
-- by the buyer side. Counsel are not team members, so their comments are
-- written by the server after it proves the caller is counsel.

create table if not exists public.contract_comment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_version_id uuid not null references public.contract_version (id) on delete cascade,
  parent_id uuid,
  author_user_id uuid references auth.users on delete set null,
  author_side public.counsel_side not null,
  quoted_text text,
  body text not null,
  internal boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, contract_version_id),
  foreign key (parent_id, contract_version_id)
    references public.contract_comment (id, contract_version_id) on delete cascade,
  check (not internal or author_side = 'buyer')
);

create index if not exists ix_contract_comment_version on public.contract_comment (contract_version_id);

alter table public.contract_comment enable row level security;

revoke all on public.contract_comment from anon, authenticated, service_role;
grant select on public.contract_comment to authenticated;
grant insert (id, account_id, contract_version_id, parent_id, author_user_id, author_side, quoted_text, body, internal)
  on public.contract_comment to authenticated;
grant update (resolved_at) on public.contract_comment to authenticated;
grant select, insert, update, delete on public.contract_comment to service_role;

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

-- The version subquery runs under the caller's own policies, so comments
-- follow version visibility wherever that is defined. The seller side reads
-- no version rows, so its versions come from seller_side_contract_version,
-- and it sees only comments in threads started since the team shared the
-- version.
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

create policy contract_comment_insert on public.contract_comment
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and author_side = 'buyer'
    and public.has_permission((select auth.uid()), account_id, 'deals.work')
  );

-- Only the author's side resolves a comment, and the team is the buyer side.
create policy contract_comment_resolve on public.contract_comment
  for update to authenticated
  using (author_side = 'buyer' and public.has_permission((select auth.uid()), account_id, 'deals.work'))
  with check (author_side = 'buyer' and public.has_permission((select auth.uid()), account_id, 'deals.work'));

create or replace function public.refuse_shared_reply_to_internal()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if not new.internal and exists (
    select 1 from public.contract_comment p
    where p.id = new.parent_id and p.internal
  ) then
    raise exception 'A reply to an internal comment is internal';
  end if;
  return new;
end;
$$;

create trigger refuse_shared_reply_to_internal
  before insert on public.contract_comment
  for each row execute function public.refuse_shared_reply_to_internal();

-- Threads stay one level deep. Only new rows are checked, so replies to
-- replies saved before this rule stay as they are.
create or replace function odb.refuse_reply_to_reply()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    select 1 from public.contract_comment p
    where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'You can only reply to a top-level comment.';
  end if;
  return new;
end;
$$;

create trigger refuse_reply_to_reply
  before insert on public.contract_comment
  for each row execute function odb.refuse_reply_to_reply();

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

-- ---- Billing lock ----
-- 'members' refuses only the team's own writes; counsel write through the
-- server as non-members.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_comment
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_contract_version_id
  before insert or update on public.contract_comment
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'contract_version_id', 'contract_version');

alter publication supabase_realtime add table public.contract_comment;
