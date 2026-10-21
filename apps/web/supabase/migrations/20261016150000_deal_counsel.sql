-- Deal counsel: enums, counsel rows, removal history, access rules and
-- billing-lock triggers. Compiled from supabase/schemas/99f-deal-counsel.sql;
-- edit that file.

-- Counsel: attorneys invited onto one side of one deal. Each side invites its
-- own; counsel sign in by magic link and never join the team, so they are not
-- deal participants. An APA needs counsel on both sides.

create type public.deal_side as enum ('buyer', 'seller', 'lender');
create type public.deal_person_role as enum ('principal', 'attorney', 'broker', 'cpa', 'other');
create type public.counsel_side as enum ('buyer', 'seller');

create table if not exists public.deal_counsel (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  side public.counsel_side not null,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  name text,
  phone text,
  company text,
  invited_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (deal_id, side, user_id)
);

create index if not exists ix_deal_counsel_user on public.deal_counsel (user_id);

alter table public.deal_counsel enable row level security;

revoke all on public.deal_counsel from anon, authenticated, service_role;
grant select, delete on public.deal_counsel to authenticated;
grant select, insert, update, delete on public.deal_counsel to service_role;

create table if not exists public.deal_counsel_removed (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  side public.counsel_side not null,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  invited_at timestamptz not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users
);

alter table public.deal_counsel_removed enable row level security;

revoke all on public.deal_counsel_removed from anon, authenticated, service_role;
grant select on public.deal_counsel_removed to authenticated;
grant select, insert, update, delete on public.deal_counsel_removed to service_role;

-- A counsel row that goes because its deal or its user is being deleted
-- leaves no record: the join finds neither.
create or replace function public.record_deal_counsel_removal()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  insert into public.deal_counsel_removed (account_id, deal_id, side, user_id, email, invited_at, removed_by)
  select old.account_id, old.deal_id, old.side, old.user_id, old.email, old.created_at, (select auth.uid())
  from public.deal d
  join auth.users u on u.id = old.user_id
  where d.id = old.deal_id;
  return old;
end;
$$;

create trigger deal_counsel_removal
  after delete on public.deal_counsel
  for each row execute function public.record_deal_counsel_removal();

-- ---- Who may do what ----

-- Portal access lasts while the deal is open: not archived and not resolved.
create or replace function public.is_deal_counsel(deal_id uuid, side public.counsel_side)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.deal_counsel c
    join public.deal d on d.id = c.deal_id
    where c.deal_id = is_deal_counsel.deal_id
      and c.side = is_deal_counsel.side
      and c.user_id = (select auth.uid())
      and d.archived_at is null
      and d.resolution is null
  );
$$;

revoke all on function public.is_deal_counsel(uuid, public.counsel_side) from public, anon;
grant execute on function public.is_deal_counsel(uuid, public.counsel_side) to authenticated, service_role;

-- Read straight from seller_room_member, so seller's counsel, who reach the
-- room without a member row, never count as the seller here. A closed room
-- still counts: the seller keeps control of their counsel.
create or replace function public.is_deal_seller_room_member(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.seller_room_member m
    join public.seller_room r on r.id = m.room_id
    where r.deal_id = is_deal_seller_room_member.deal_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_deal_seller_room_member(uuid) from public, anon;
grant execute on function public.is_deal_seller_room_member(uuid) to authenticated, service_role;

create or replace function public.apa_counsel_ready(deal_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  if auth.uid() is not null
    and not exists (
      select 1 from public.deal d
      where d.id = apa_counsel_ready.deal_id and public.has_role_on_account(d.account_id)
    )
    and not public.is_deal_counsel(apa_counsel_ready.deal_id, 'buyer')
    and not public.is_deal_counsel(apa_counsel_ready.deal_id, 'seller') then
    raise exception 'not a member of this deal' using errcode = 'insufficient_privilege';
  end if;
  return exists (
    select 1 from public.deal_counsel c
    where c.deal_id = apa_counsel_ready.deal_id and c.side = 'buyer'
  ) and exists (
    select 1 from public.deal_counsel c
    where c.deal_id = apa_counsel_ready.deal_id and c.side = 'seller'
  );
end;
$$;

revoke all on function public.apa_counsel_ready(uuid) from public, anon;
grant execute on function public.apa_counsel_ready(uuid) to authenticated, service_role;

create policy deal_counsel_read on public.deal_counsel
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or user_id = (select auth.uid())
    or (side = 'seller' and public.is_deal_seller_room_member(deal_id))
  );

create policy deal_counsel_delete on public.deal_counsel
  for delete to authenticated
  using (
    (side = 'buyer' and public.manages_deal_in_account(deal_id, account_id))
    or (side = 'seller' and public.is_deal_seller_room_member(deal_id))
  );

create policy deal_counsel_removed_read on public.deal_counsel_removed
  for select to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

-- ---- Billing lock ----
-- 'members' refuses only the team's own writes, so the seller keeps managing
-- their counsel while the team is locked.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_counsel
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_counsel_removed
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.deal_counsel
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_counsel_removed
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');
