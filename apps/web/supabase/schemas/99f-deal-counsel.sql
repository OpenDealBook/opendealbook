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
  profile_asked_at timestamptz,
  unique (deal_id, side, user_id),
  -- One person never acts for both sides of a deal. Removal deletes the row,
  -- so only current counsel block.
  constraint deal_counsel_one_side unique (deal_id, user_id)
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

-- The sides an address already holds on a deal: the team and buyer's counsel
-- are the buyer side, the seller room and seller's counsel the seller side.
create or replace function public.deal_side_of_email(deal_id uuid, email text)
  returns setof public.deal_side
  language sql stable security definer
  set search_path = '' as $$
  with person as (
    select u.id from auth.users u where lower(u.email) = lower(deal_side_of_email.email)
  )
  select distinct s.side from (
    select 'buyer'::public.deal_side as side
    from public.deal d
    join public.accounts_memberships m on m.account_id = d.account_id
    where d.id = deal_side_of_email.deal_id and m.user_id in (select id from person)
    union all
    select 'buyer'
    from public.deal d
    join public.accounts a on a.id = d.account_id
    where d.id = deal_side_of_email.deal_id and a.primary_owner_user_id in (select id from person)
    union all
    select 'lender'
    from public.lender_room r
    join public.lender_room_member m on m.room_id = r.id
    where r.deal_id = deal_side_of_email.deal_id
      and (m.user_id in (select id from person) or lower(m.email) = lower(deal_side_of_email.email))
    union all
    select 'seller'
    from public.seller_room r
    join public.seller_room_member m on m.room_id = r.id
    where r.deal_id = deal_side_of_email.deal_id
      and (m.user_id in (select id from person) or lower(m.email) = lower(deal_side_of_email.email))
    union all
    select c.side::text::public.deal_side
    from public.deal_counsel c
    where c.deal_id = deal_side_of_email.deal_id
      and (c.user_id in (select id from person) or lower(c.email) = lower(deal_side_of_email.email))
  ) s;
$$;

revoke all on function public.deal_side_of_email(uuid, text) from public, anon, authenticated;
grant execute on function public.deal_side_of_email(uuid, text) to service_role;

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

-- The gate follows the built-in stage keys, not their order, and applies only
-- while the team keeps a pa_accepted stage.
create or replace function public.apa_stage_gated(account_id uuid, stage text)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select apa_stage_gated.stage = any (array['pa_accepted', 'announcement', 'integration'])
    and exists (
      select 1 from public.pipeline_stage s
      where s.account_id = apa_stage_gated.account_id and s.key = 'pa_accepted'
    );
$$;

revoke all on function public.apa_stage_gated(uuid, text) from public, anon, authenticated;

-- Guarded on the deal row so every path into a gated stage, manual or
-- Documenso, is refused. Only crossing in is guarded: a deal already there
-- keeps moving when counsel later leave. A signed APA always completes.
create or replace function public.refuse_apa_stage_without_counsel()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if public.apa_stage_gated(new.account_id, new.stage)
    and not public.apa_stage_gated(old.account_id, old.stage)
    and not public.apa_counsel_ready(new.id)
    and not exists (
      select 1 from public.contract c
      join public.contract_version v on v.contract_id = c.id
      where c.deal_id = new.id and c.type = 'apa' and v.is_signed
    ) then
    raise exception 'An APA needs buyer''s counsel and seller''s counsel on the deal';
  end if;
  return new;
end;
$$;

-- Seeding and system imports run without a user and may start a deal late.
create or replace function public.refuse_late_deal_creation()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (select auth.uid()) is not null and public.apa_stage_gated(new.account_id, new.stage) then
    raise exception 'A new deal cannot start at PA Accepted or a later stage';
  end if;
  return new;
end;
$$;

create trigger refuse_late_deal_creation
  before insert on public.deal
  for each row execute function public.refuse_late_deal_creation();

create trigger refuse_apa_stage_without_counsel
  before update of stage on public.deal
  for each row
  when (new.stage is distinct from old.stage)
  execute function public.refuse_apa_stage_without_counsel();

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

-- ---- Contracts ----
-- Buyer's counsel read the contract tables directly, as the team does. The
-- seller side, seller's counsel and the members of an open seller room, never
-- do: a row count, a version number, a file path or current_version would tell
-- them a hidden draft exists. They read through the functions below, which show
-- what the team shared and what the seller side wrote, by seller number, with
-- the highest of those as current.

create policy contract_buyer_counsel_read on public.contract
  for select to authenticated
  using (public.is_deal_counsel(deal_id, 'buyer'));

create policy contract_version_buyer_counsel_read on public.contract_version
  for select to authenticated
  using (
    public.is_deal_counsel((select c.deal_id from public.contract c where c.id = contract_id), 'buyer')
  );

create or replace function public.reads_contracts_as_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_counsel(reads_contracts_as_seller_side.deal_id, 'seller')
    or reads_contracts_as_seller_side.deal_id = any (public.seller_room_deal_ids());
$$;

revoke all on function public.reads_contracts_as_seller_side(uuid) from public, anon;
grant execute on function public.reads_contracts_as_seller_side(uuid) to authenticated, service_role;

create or replace function public.seller_side_contract_versions(deal_id uuid)
  returns table (
    id uuid,
    contract_id uuid,
    version int,
    party text,
    change_summary text,
    is_signed boolean,
    shown_at timestamptz,
    extends_to date
  )
  language sql stable security definer
  set search_path = '' as $$
  select v.id, v.contract_id, v.seller_number,
    v.party, v.change_summary, v.is_signed,
    case when v.party = 'seller' then v.created_at else v.shared_at end,
    v.extends_to
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

-- ---- Data room and seller Q&A for buyer's counsel ----
-- Counsel are not on the data room read policies, which another file owns;
-- they read through these. The whole data room, less each lender room's own
-- folder, and the seller Q&A read-only.

-- plpgsql so the body is not checked here: seller_counsel_folder loads later, in 99v.
create or replace function public.buyer_counsel_folders(deal_id uuid)
  returns setof public.dr_folder
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  with recursive lender_room_own as (
    select r.private_folder_id as id
    from public.lender_room r
    where r.deal_id = buyer_counsel_folders.deal_id
    union all
    select f.id from public.dr_folder f join lender_room_own o on f.parent_id = o.id
  ),
  seller_counsel_own as (
    select s.folder_id as id
    from public.seller_counsel_folder s
    where s.deal_id = buyer_counsel_folders.deal_id
    union all
    select f.id from public.dr_folder f join seller_counsel_own o on f.parent_id = o.id
  )
  select f.*
  from public.dr_folder f
  where f.deal_id = buyer_counsel_folders.deal_id
    and public.is_deal_counsel(buyer_counsel_folders.deal_id, 'buyer')
    and f.id not in (select o.id from lender_room_own o)
    and f.id not in (select o.id from seller_counsel_own o);
end;
$$;

revoke all on function public.buyer_counsel_folders(uuid) from public, anon;
grant execute on function public.buyer_counsel_folders(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_documents(deal_id uuid)
  returns setof public.dr_document
  language sql stable security definer
  set search_path = '' as $$
  select d.*
  from public.dr_document d
  join public.buyer_counsel_folders(buyer_counsel_documents.deal_id) f on f.id = d.folder_id
  where d.removed_at is null;
$$;

revoke all on function public.buyer_counsel_documents(uuid) from public, anon;
grant execute on function public.buyer_counsel_documents(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_seller_questions(deal_id uuid)
  returns table (
    id uuid,
    title text,
    body text,
    status public.seller_room_question_status,
    created_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select q.id, q.title, q.body, q.status, q.created_at
  from public.seller_room_question q
  join public.seller_room r on r.id = q.room_id
  where r.deal_id = buyer_counsel_seller_questions.deal_id
    and public.is_deal_counsel(buyer_counsel_seller_questions.deal_id, 'buyer')
  order by q.created_at desc;
$$;

revoke all on function public.buyer_counsel_seller_questions(uuid) from public, anon;
grant execute on function public.buyer_counsel_seller_questions(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_seller_question_messages(deal_id uuid)
  returns table (question_id uuid, side public.seller_side, body text, created_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select m.question_id, m.side, m.body, m.created_at
  from public.seller_room_question_message m
  join public.seller_room_question q on q.id = m.question_id
  join public.seller_room r on r.id = q.room_id
  where r.deal_id = buyer_counsel_seller_question_messages.deal_id
    and public.is_deal_counsel(buyer_counsel_seller_question_messages.deal_id, 'buyer')
  order by m.created_at;
$$;

revoke all on function public.buyer_counsel_seller_question_messages(uuid) from public, anon;
grant execute on function public.buyer_counsel_seller_question_messages(uuid) to authenticated, service_role;

create or replace function public.buyer_counsel_legacy_seller_questions(deal_id uuid)
  returns table (id uuid, question text, answer text, answered_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select q.id, q.question, q.answer, q.answered_at
  from public.seller_question q
  where q.deal_id = buyer_counsel_legacy_seller_questions.deal_id
    and public.is_deal_counsel(buyer_counsel_legacy_seller_questions.deal_id, 'buyer')
  order by q.created_at nulls last;
$$;

revoke all on function public.buyer_counsel_legacy_seller_questions(uuid) from public, anon;
grant execute on function public.buyer_counsel_legacy_seller_questions(uuid) to authenticated, service_role;

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
