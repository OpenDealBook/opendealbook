-- Lender rooms. Each lender institution on a deal gets one private room that
-- shows the deal's master lender package (a data room folder shared by
-- reference) plus the room's own private folder. Lenders are room members,
-- never deal participants, so nothing else on the deal reaches them.
--
-- Lenders only read here. Every lender write is made by server code with the
-- service role, after it has checked the caller.
--
-- The dr_folder and dr_document read policies live at the end of this file
-- because they depend on lender_can_read_folder and lender_can_read_document.

create type public.lender_room_status as enum ('invited', 'reviewing', 'term_sheet', 'declined', 'selected');
create type public.lender_ask_kind as enum ('ask', 'form');
create type public.lender_ask_status as enum ('open', 'answered', 'closed', 'withdrawn');
create type public.lender_return_route as enum ('upload', 'esign');
create type public.lender_ask_file_role as enum ('attachment', 'fulfilment', 'blank_form', 'completed_form', 'signed_form');
create type public.lender_side as enum ('lender', 'internal');
create type public.lender_activity_action as enum ('room_opened', 'folder_opened', 'document_previewed', 'document_downloaded', 'zip_downloaded', 'folder_created');
create type public.lender_signature_status as enum ('draft', 'sent', 'completed', 'declined', 'expired', 'cancelled');

-- Global across accounts so one lookup serves every tenant, which is why no
-- signed-in user reads it directly: rooms hand out their own brand through
-- lender_room_view.
create table if not exists public.lender_brand (
  domain text primary key,
  name text,
  logo_path text,
  fetched_at timestamptz
);

alter table public.lender_brand enable row level security;

revoke all on public.lender_brand from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_brand to service_role;

-- The deal's master lender package: the one data room folder every room on
-- the deal draws from.
create table if not exists public.lender_package (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  master_folder_id uuid not null references public.dr_folder (id)
);

alter table public.lender_package enable row level security;

revoke all on public.lender_package from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_package to authenticated;
grant select, insert, update, delete on public.lender_package to service_role;

create policy lender_package_read on public.lender_package
  for select to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

create policy lender_package_insert on public.lender_package
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy lender_package_update on public.lender_package
  for update to authenticated
  using (public.manages_deal_in_account(deal_id, account_id))
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy lender_package_delete on public.lender_package
  for delete to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

-- Nothing closes an expired room: open is worked out from closed_at and
-- expires_at on every read.
create table if not exists public.lender_room (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  brand_domain text references public.lender_brand (domain),
  name text not null,
  welcome_note text,
  status public.lender_room_status not null default 'invited',
  expires_at timestamptz default now() + interval '60 days',
  closed_at timestamptz,
  private_folder_id uuid not null references public.dr_folder (id),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (id, account_id),
  unique (id, deal_id)
);

create unique index if not exists lender_room_deal_brand_domain_key
  on public.lender_room (deal_id, brand_domain) where brand_domain is not null;

alter table public.lender_room enable row level security;

revoke all on public.lender_room from anon, authenticated, service_role;
grant select, insert, update on public.lender_room to authenticated;
grant select, insert, update, delete on public.lender_room to service_role;

create trigger lender_room_timestamps
  before insert or update on public.lender_room
  for each row execute function public.set_timestamps();

create trigger lender_room_user_tracking
  before insert or update on public.lender_room
  for each row execute function public.set_user_tracking();

create table if not exists public.lender_room_member (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.lender_room (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  invited_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists ix_lender_room_member_user on public.lender_room_member (user_id);

alter table public.lender_room_member enable row level security;

revoke all on public.lender_room_member from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_room_member to authenticated;
grant select, insert, update, delete on public.lender_room_member to service_role;

-- Who was taken out of a room and when, for the team's eyes. A row is written
-- by the removal itself and by nothing else, so a person invited again has a
-- live lender_room_member row beside their earlier rows here.
create table if not exists public.lender_room_removed_member (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.lender_room (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  invited_at timestamptz not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users
);

alter table public.lender_room_removed_member enable row level security;

revoke all on public.lender_room_removed_member from anon, authenticated, service_role;
grant select on public.lender_room_removed_member to authenticated;
grant select on public.lender_room_removed_member to service_role;

-- A member row that goes because its room or its user is being deleted
-- leaves no record: the join finds neither.
create or replace function public.record_lender_room_removal()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  insert into public.lender_room_removed_member (room_id, user_id, email, invited_at, removed_by)
  select old.room_id, old.user_id, old.email, old.created_at, (select auth.uid())
  from public.lender_room r
  join auth.users u on u.id = old.user_id
  where r.id = old.room_id;
  return old;
end;
$$;

create trigger lender_room_member_removal
  after delete on public.lender_room_member
  for each row execute function public.record_lender_room_removal();

-- A master package folder or document withheld from one room.
create table if not exists public.lender_room_hidden (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.lender_room (id) on delete cascade,
  dr_folder_id uuid references public.dr_folder (id) on delete cascade,
  -- No foreign key on any dr_document_id in this file: replay_deal deletes a
  -- deal's documents and puts them back under the same ids, and lender rows
  -- must neither block that nor be swept away by it. Activity's dr_folder_id
  -- is bare too, so history never blocks deleting a folder.
  dr_document_id uuid,
  check (num_nonnulls(dr_folder_id, dr_document_id) = 1),
  unique (room_id, dr_folder_id),
  unique (room_id, dr_document_id)
);

alter table public.lender_room_hidden enable row level security;

revoke all on public.lender_room_hidden from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_room_hidden to authenticated;
grant select, insert, update, delete on public.lender_room_hidden to service_role;

create or replace function public.lender_room_is_open(room public.lender_room)
  returns boolean
  language sql
  set search_path = '' as $$
  select room.closed_at is null and (room.expires_at is null or room.expires_at > now());
$$;

create or replace function public.can_manage_lender_room(room_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.lender_room r
    where r.id = can_manage_lender_room.room_id
      and public.manages_deal_in_account(r.deal_id, r.account_id)
  );
$$;

grant execute on function public.can_manage_lender_room(uuid) to authenticated, service_role;

create or replace function public.is_lender_room_member(room_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.lender_room_member m
    join public.lender_room r on r.id = m.room_id
    where m.room_id = is_lender_room_member.room_id
      and m.user_id = (select auth.uid())
      and public.lender_room_is_open(r)
  );
$$;

grant execute on function public.is_lender_room_member(uuid) to authenticated, service_role;

-- A lender's own name: typed by the team at invite, then set or corrected by
-- the lender at first sign-in. Until then only the email is known. Written by
-- server code alone.
create table if not exists public.lender_person (
  user_id uuid primary key references auth.users on delete cascade,
  name text check (name is null or length(btrim(name)) > 0),
  name_asked_at timestamptz
);

alter table public.lender_person enable row level security;

revoke all on public.lender_person from anon, authenticated, service_role;
grant select on public.lender_person to authenticated;
grant select, insert, update, delete on public.lender_person to service_role;

-- Whose lender_person row the caller may read besides their own: everyone in
-- an open room the caller is in, and everyone in or removed from a room the
-- caller's team manages. Worked out once per statement from the caller's own
-- rooms and accounts.
create or replace function public.lender_person_visible_user_ids()
  returns uuid[]
  language sql stable security definer
  set search_path = '' as $$
  with managed_room as (
    select r.id
    from public.lender_room r
    where r.account_id in (
        select am.account_id from public.accounts_memberships am where am.user_id = (select auth.uid())
        union
        select a.id from public.accounts a where a.primary_owner_user_id = (select auth.uid())
      )
      and public.manages_deal_in_account(r.deal_id, r.account_id)
  )
  select coalesce(array_agg(distinct p.user_id), '{}')
  from (
    select m.user_id
    from public.lender_room_member mine
    join public.lender_room r on r.id = mine.room_id
    join public.lender_room_member m on m.room_id = r.id
    where mine.user_id = (select auth.uid())
      and public.lender_room_is_open(r)
    union
    select m.user_id from public.lender_room_member m join managed_room mr on mr.id = m.room_id
    union
    select rm.user_id from public.lender_room_removed_member rm join managed_room mr on mr.id = rm.room_id
  ) p;
$$;

grant execute on function public.lender_person_visible_user_ids() to authenticated, service_role;

create policy lender_person_read on public.lender_person
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id = any ((select public.lender_person_visible_user_ids())::uuid[])
  );

-- What one room shows of the data room, regardless of who is asking: its own
-- folder subtree, plus the master package subtree unless the folder or one of
-- its ancestors is hidden for that room. Only ever a folder of the room's own
-- deal, whatever folder the room or package row names.
create or replace function public.lender_room_shows_folder_unchecked(room_id uuid, folder_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  with recursive ancestry as (
    select f.id, f.parent_id
    from public.dr_folder f
    where f.id = lender_room_shows_folder_unchecked.folder_id
    union all
    select p.id, p.parent_id
    from public.dr_folder p
    join ancestry a on p.id = a.parent_id
  )
  select exists (
    select 1
    from public.lender_room r
    join public.dr_folder f on f.id = lender_room_shows_folder_unchecked.folder_id and f.deal_id = r.deal_id
    where r.id = lender_room_shows_folder_unchecked.room_id
      and (
        exists (select 1 from ancestry a where a.id = r.private_folder_id)
        or (
          exists (
            select 1 from ancestry a
            join public.lender_package p on p.master_folder_id = a.id
            where p.deal_id = r.deal_id
          )
          and not exists (
            select 1 from ancestry a
            join public.lender_room_hidden h on h.dr_folder_id = a.id
            where h.room_id = r.id
          )
        )
      )
  );
$$;

-- Answers only for a room the caller belongs to or manages.
create or replace function public.lender_room_shows_folder(room_id uuid, folder_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select (
      public.is_lender_room_member(lender_room_shows_folder.room_id)
      or public.can_manage_lender_room(lender_room_shows_folder.room_id)
    )
    and public.lender_room_shows_folder_unchecked(lender_room_shows_folder.room_id, lender_room_shows_folder.folder_id);
$$;

grant execute on function public.lender_room_shows_folder(uuid, uuid) to authenticated, service_role;

-- The deals of the open rooms the caller belongs to. The data room read
-- policies test a row's deal against this once per statement, so reading
-- costs a caller nothing per row for rooms that are not theirs.
create or replace function public.lender_open_room_deal_ids()
  returns uuid[]
  language sql stable security definer
  set search_path = '' as $$
  select coalesce(array_agg(distinct r.deal_id), '{}')
  from public.lender_room_member m
  join public.lender_room r on r.id = m.room_id
  where m.user_id = (select auth.uid())
    and public.lender_room_is_open(r);
$$;

grant execute on function public.lender_open_room_deal_ids() to authenticated, service_role;

create or replace function public.lender_can_read_folder(folder_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.lender_room_member m
    join public.lender_room r on r.id = m.room_id
    where m.user_id = (select auth.uid())
      and public.lender_room_is_open(r)
      and public.lender_room_shows_folder_unchecked(r.id, lender_can_read_folder.folder_id)
  );
$$;

grant execute on function public.lender_can_read_folder(uuid) to authenticated, service_role;

-- What one room shows of a deal's documents, regardless of who is asking.
-- Versions of a file are separate rows sharing a folder and name, so hiding
-- one hides them all.
create or replace function public.lender_room_shows_document_unchecked(room_id uuid, document_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.dr_document d
    join public.lender_room r on r.id = lender_room_shows_document_unchecked.room_id and r.deal_id = d.deal_id
    where d.id = lender_room_shows_document_unchecked.document_id
      and d.removed_at is null
      and public.lender_room_shows_folder_unchecked(r.id, d.folder_id)
      and not exists (
        select 1
        from public.lender_room_hidden h
        join public.dr_document hd on hd.id = h.dr_document_id
        where h.room_id = r.id
          and hd.folder_id = d.folder_id
          and hd.name = d.name
      )
  );
$$;

-- Answers only for a room the caller belongs to or manages.
create or replace function public.lender_room_shows_document(room_id uuid, document_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select (
      public.is_lender_room_member(lender_room_shows_document.room_id)
      or public.can_manage_lender_room(lender_room_shows_document.room_id)
    )
    and public.lender_room_shows_document_unchecked(lender_room_shows_document.room_id, lender_room_shows_document.document_id);
$$;

grant execute on function public.lender_room_shows_document(uuid, uuid) to authenticated, service_role;

create or replace function public.lender_can_read_document(document_id uuid)
  returns boolean
  language sql security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.lender_room_member m
    join public.lender_room r on r.id = m.room_id
    where m.user_id = (select auth.uid())
      and public.lender_room_is_open(r)
      and public.lender_room_shows_document_unchecked(r.id, lender_can_read_document.document_id)
  );
$$;

grant execute on function public.lender_can_read_document(uuid) to authenticated, service_role;

-- All a lender ever learns about a room and its deal. Status, account, and
-- people are left out on purpose.
create type public.lender_room_summary as (
  id uuid,
  deal_id uuid,
  name text,
  welcome_note text,
  expires_at timestamptz,
  is_open boolean,
  private_folder_id uuid,
  master_folder_id uuid,
  brand_name text,
  brand_logo_path text,
  deal_name text,
  deal_description text
);

-- Members keep this after the room closes so the closed page can name it, but
-- a room that is not open gives them neither its folders nor its welcome note.
-- The team gets the full row either way: closed rooms are its archive.
create or replace function public.lender_room_view(room_id uuid)
  returns setof public.lender_room_summary
  language sql security definer
  set search_path = '' as $$
  select
    r.id,
    r.deal_id,
    r.name,
    case when a.full_row then r.welcome_note end,
    r.expires_at,
    public.lender_room_is_open(r),
    case when a.full_row then r.private_folder_id end,
    case when a.full_row then p.master_folder_id end,
    b.name,
    b.logo_path,
    f.name::text,
    d.description
  from public.lender_room r
  cross join lateral (
    select
      public.can_manage_lender_room(r.id) as manages,
      public.can_manage_lender_room(r.id) or public.lender_room_is_open(r) as full_row
  ) a
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  left join public.lender_package p on p.deal_id = r.deal_id
  left join public.lender_brand b on b.domain = r.brand_domain
  where r.id = lender_room_view.room_id
    and (
      a.manages
      or exists (
        select 1 from public.lender_room_member m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
    );
$$;

grant execute on function public.lender_room_view(uuid) to authenticated, service_role;

create or replace function public.my_lender_rooms()
  returns setof public.lender_room_summary
  language sql security definer
  set search_path = '' as $$
  select v.*
  from public.lender_room_member m
  cross join lateral public.lender_room_view(m.room_id) v
  where m.user_id = (select auth.uid());
$$;

grant execute on function public.my_lender_rooms() to authenticated, service_role;

-- For the notification relay, which has no user session: whom to tell about a
-- document. Service role only, since it answers for every room at once.
create or replace function public.lender_document_recipients(document_id uuid)
  returns table (room_id uuid, user_id uuid, email text)
  language sql security definer
  set search_path = '' as $$
  select m.room_id, m.user_id, u.email::text
  from public.lender_room r
  join public.lender_room_member m on m.room_id = r.id
  join auth.users u on u.id = m.user_id
  where public.lender_room_is_open(r)
    and public.lender_room_shows_document_unchecked(r.id, lender_document_recipients.document_id);
$$;

grant execute on function public.lender_document_recipients(uuid) to service_role;

-- For server code acting for a person it has already identified: which of
-- these documents that person can open, and through which room (the lowest
-- room id when several show it). Service role only, since it answers for
-- whichever person is named.
create or replace function public.lender_visible_documents(user_id uuid, document_ids uuid[])
  returns table (document_id uuid, name text, folder_id uuid, room_id uuid, room_name text)
  language sql security definer
  set search_path = '' as $$
  select distinct on (d.id) d.id, d.name, d.folder_id, r.id, r.name
  from public.dr_document d
  join public.lender_room r on r.deal_id = d.deal_id
  join public.lender_room_member m on m.room_id = r.id
  where d.id = any (lender_visible_documents.document_ids)
    and m.user_id = lender_visible_documents.user_id
    and public.lender_room_is_open(r)
    and public.lender_room_shows_document_unchecked(r.id, d.id)
  order by d.id, r.id;
$$;

grant execute on function public.lender_visible_documents(uuid, uuid[]) to service_role;

-- For server code holding a room to its folder limit: how many folders sit
-- below the room's own folder. Service role only, since it answers for any
-- room.
create or replace function public.lender_room_folder_count(room_id uuid)
  returns integer
  language sql security definer
  set search_path = '' as $$
  with recursive below as (
    select f.id
    from public.dr_folder f
    join public.lender_room r on r.private_folder_id = f.parent_id and r.deal_id = f.deal_id
    where r.id = lender_room_folder_count.room_id
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select count(*)::integer from below;
$$;

grant execute on function public.lender_room_folder_count(uuid) to service_role;

-- For server code holding a deal's lender package to its folder limit: how
-- many folders sit below the package's master folder. Service role only.
create or replace function public.lender_package_folder_count(deal_id uuid)
  returns integer
  language sql security definer
  set search_path = '' as $$
  with recursive below as (
    select f.id
    from public.dr_folder f
    join public.lender_package p on p.master_folder_id = f.parent_id and p.deal_id = f.deal_id
    where p.deal_id = lender_package_folder_count.deal_id
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select count(*)::integer from below;
$$;

grant execute on function public.lender_package_folder_count(uuid) to service_role;

create policy lender_room_read on public.lender_room
  for select to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

create policy lender_room_insert on public.lender_room
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy lender_room_update on public.lender_room
  for update to authenticated
  using (public.manages_deal_in_account(deal_id, account_id))
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy lender_room_member_read on public.lender_room_member
  for select to authenticated
  using (
    public.is_lender_room_member(room_id)
    or public.can_manage_lender_room(room_id)
  );

create policy lender_room_member_insert on public.lender_room_member
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id));

create policy lender_room_member_update on public.lender_room_member
  for update to authenticated
  using (public.can_manage_lender_room(room_id))
  with check (public.can_manage_lender_room(room_id));

create policy lender_room_member_delete on public.lender_room_member
  for delete to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_room_removed_member_read on public.lender_room_removed_member
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_room_hidden_read on public.lender_room_hidden
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_room_hidden_insert on public.lender_room_hidden
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id));

create policy lender_room_hidden_update on public.lender_room_hidden
  for update to authenticated
  using (public.can_manage_lender_room(room_id))
  with check (public.can_manage_lender_room(room_id));

create policy lender_room_hidden_delete on public.lender_room_hidden
  for delete to authenticated
  using (public.can_manage_lender_room(room_id));

-- A lender's request for more, or a form of theirs for us to complete. The
-- composite key keeps account_id equal to the room's account.
create table if not exists public.lender_ask (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  kind public.lender_ask_kind not null,
  title text not null,
  body text,
  status public.lender_ask_status not null default 'open',
  return_route public.lender_return_route,
  first_response_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (room_id, account_id) references public.lender_room (id, account_id) on delete cascade,
  check ((kind = 'form') = (return_route is not null))
);

alter table public.lender_ask enable row level security;

revoke all on public.lender_ask from anon, authenticated, service_role;
grant select, update on public.lender_ask to authenticated;
grant select, insert, update, delete on public.lender_ask to service_role;

create policy lender_ask_read on public.lender_ask
  for select to authenticated
  using (
    public.can_manage_lender_room(room_id)
    or public.is_lender_room_member(room_id)
  );

create policy lender_ask_update on public.lender_ask
  for update to authenticated
  using (public.can_manage_lender_room(room_id))
  with check (public.can_manage_lender_room(room_id));

create table if not exists public.lender_ask_message (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references public.lender_ask (id) on delete cascade,
  author_user_id uuid references auth.users default auth.uid(),
  side public.lender_side not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.lender_ask_message enable row level security;

revoke all on public.lender_ask_message from anon, authenticated, service_role;
grant select, insert on public.lender_ask_message to authenticated;
grant select, insert, update, delete on public.lender_ask_message to service_role;

create policy lender_ask_message_read on public.lender_ask_message
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_message.ask_id
        and (
          public.can_manage_lender_room(a.room_id)
          or public.is_lender_room_member(a.room_id)
        )
    )
  );

create policy lender_ask_message_insert on public.lender_ask_message
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and side = 'internal'
    and exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_message.ask_id
        and public.can_manage_lender_room(a.room_id)
    )
  );

create table if not exists public.lender_ask_file (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references public.lender_ask (id) on delete cascade,
  dr_document_id uuid not null,
  role public.lender_ask_file_role not null,
  added_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.lender_ask_file enable row level security;

revoke all on public.lender_ask_file from anon, authenticated, service_role;
grant select, insert on public.lender_ask_file to authenticated;
grant select, insert, update, delete on public.lender_ask_file to service_role;

create policy lender_ask_file_read on public.lender_ask_file
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_file.ask_id
        and (
          public.can_manage_lender_room(a.room_id)
          or public.is_lender_room_member(a.room_id)
        )
    )
  );

create policy lender_ask_file_insert on public.lender_ask_file
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.lender_ask a
      where a.id = lender_ask_file.ask_id
        and public.can_manage_lender_room(a.room_id)
        and public.lender_room_shows_document(a.room_id, lender_ask_file.dr_document_id)
    )
  );

-- One e-sign envelope sent for a form ask. A declined or expired envelope is
-- only recorded; sending again is a new row.
create table if not exists public.lender_form_signature (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references public.lender_ask (id) on delete cascade,
  documenso_document_id text not null unique,
  signers jsonb not null,
  status public.lender_signature_status not null default 'draft',
  editor_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists lender_form_signature_one_open_per_ask
  on public.lender_form_signature (ask_id) where status in ('draft', 'sent');

alter table public.lender_form_signature enable row level security;

revoke all on public.lender_form_signature from anon, authenticated, service_role;
grant select on public.lender_form_signature to authenticated;
grant select, insert, update, delete on public.lender_form_signature to service_role;

create policy lender_form_signature_read on public.lender_form_signature
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_ask a
      where a.id = lender_form_signature.ask_id
        and public.can_manage_lender_room(a.room_id)
    )
  );

-- What a lender may know of a form's signing: where each request stands,
-- never who signs, the signing service's document, or the editor link.
create or replace function public.lender_form_signature_status(ask_id uuid)
  returns table (id uuid, status public.lender_signature_status, created_at timestamptz)
  language sql security definer
  set search_path = '' as $$
  select s.id, s.status, s.created_at
  from public.lender_form_signature s
  join public.lender_ask a on a.id = s.ask_id
  where s.ask_id = lender_form_signature_status.ask_id
    and (
      public.is_lender_room_member(a.room_id)
      or public.can_manage_lender_room(a.room_id)
    )
  order by s.created_at desc;
$$;

grant execute on function public.lender_form_signature_status(uuid) to authenticated, service_role;

-- Append-only record of everything anyone looks at in a room, ours included.
-- The composite key keeps account_id equal to the room's account.
create table if not exists public.lender_room_activity (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  user_id uuid references auth.users default auth.uid(),
  side public.lender_side not null,
  action public.lender_activity_action not null,
  dr_document_id uuid,
  dr_folder_id uuid,
  payload jsonb,
  created_at timestamptz not null default now(),
  foreign key (room_id, account_id) references public.lender_room (id, account_id) on delete cascade
);

alter table public.lender_room_activity enable row level security;

revoke all on public.lender_room_activity from anon, authenticated, service_role;
grant select, insert on public.lender_room_activity to authenticated;
grant select, insert, update, delete on public.lender_room_activity to service_role;

create policy lender_room_activity_read on public.lender_room_activity
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_room_activity_insert on public.lender_room_activity
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and side = 'internal'
    and public.can_manage_lender_room(room_id)
  );

-- Placeholder for a file inside an expanded zip that was over the size cap:
-- it is not stored, only listed in its folder as too large. The service role
-- writes it during zip expansion.
create table if not exists public.lender_oversize_file (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  dr_folder_id uuid not null references public.dr_folder (id) on delete cascade,
  name text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

alter table public.lender_oversize_file enable row level security;

revoke all on public.lender_oversize_file from anon, authenticated, service_role;
grant select on public.lender_oversize_file to authenticated;
grant select, insert, update, delete on public.lender_oversize_file to service_role;

create policy lender_oversize_file_read on public.lender_oversize_file
  for select to authenticated
  using (
    public.lender_can_read_folder(dr_folder_id)
    or exists (
      select 1 from public.dr_folder f
      where f.id = lender_oversize_file.dr_folder_id
        and public.manages_deal_in_account(f.deal_id, f.account_id)
    )
  );

-- An upload the server issued a storage key for. Registering reads the key
-- from this row, never from the caller, so a file can only ever be registered
-- at the path the server chose. Service role only. A lender's upload names its
-- room, which must be on the upload's deal; the team's upload into the lender
-- package names no room.
create table if not exists public.lender_upload (
  id uuid primary key default gen_random_uuid(),
  room_id uuid,
  deal_id uuid not null references public.deal (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  keep_as_zip boolean,
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  registered_at timestamptz,
  document_ids uuid[],
  foreign key (room_id, deal_id) references public.lender_room (id, deal_id) on delete cascade
);

alter table public.lender_upload enable row level security;

revoke all on public.lender_upload from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_upload to service_role;

-- When each rate-limited key last got through, for server code that must not
-- send or fetch on demand without bound. Service role only.
create table if not exists public.lender_rate_limit (
  key text primary key,
  last_at timestamptz not null
);

alter table public.lender_rate_limit enable row level security;

revoke all on public.lender_rate_limit from anon, authenticated, service_role;
grant select, insert, update, delete on public.lender_rate_limit to service_role;

-- One statement, so two callers racing on a key cannot both pass.
create or replace function public.lender_rate_limit_pass(key text, window_seconds int)
  returns boolean
  language sql
  set search_path = '' as $$
  with passed as (
    insert into public.lender_rate_limit as l (key, last_at)
    values (lender_rate_limit_pass.key, now())
    on conflict (key) do update set last_at = excluded.last_at
    where l.last_at <= now() - make_interval(secs => lender_rate_limit_pass.window_seconds)
    returning 1
  )
  select exists (select 1 from passed);
$$;

grant execute on function public.lender_rate_limit_pass(text, int) to service_role;

-- Everyone invited to a room, removed from it, or who acted in it, for the
-- team's eyes only.
create or replace function public.lender_room_people(room_id uuid)
  returns table (user_id uuid, email text, name text)
  language sql security definer
  set search_path = '' as $$
  with recursive own_folder as (
    select r.private_folder_id as id
    from public.lender_room r
    where r.id = lender_room_people.room_id
    union all
    select f.id from public.dr_folder f join own_folder o on f.parent_id = o.id
  )
  select u.id, u.email::text, lp.name
  from auth.users u
  left join public.lender_person lp on lp.user_id = u.id
  where public.can_manage_lender_room(lender_room_people.room_id)
    and u.id in (
      select m.user_id from public.lender_room_member m
      where m.room_id = lender_room_people.room_id
      union
      select rm.user_id from public.lender_room_removed_member rm
      where rm.room_id = lender_room_people.room_id
      union
      select a.user_id from public.lender_room_activity a
      where a.room_id = lender_room_people.room_id
      union
      select k.created_by from public.lender_ask k
      where k.room_id = lender_room_people.room_id
      union
      select msg.author_user_id
      from public.lender_ask_message msg
      join public.lender_ask k on k.id = msg.ask_id
      where k.room_id = lender_room_people.room_id
      union
      select af.added_by
      from public.lender_ask_file af
      join public.lender_ask k on k.id = af.ask_id
      where k.room_id = lender_room_people.room_id
      union
      select d.uploaded_by
      from public.dr_document d
      join own_folder o on o.id = d.folder_id
    );
$$;

grant execute on function public.lender_room_people(uuid) to authenticated, service_role;

-- A team's lender rooms across all of its deals, for the team's Lenders
-- section. Answers only to a caller who manages deals on that account, and
-- only for rooms on deals that really belong to it.
create or replace function public.team_lender_rooms(account_id uuid)
  returns table (
    room_id uuid,
    deal_id uuid,
    deal_name text,
    deal_description text,
    room_name text,
    status public.lender_room_status,
    expires_at timestamptz,
    closed_at timestamptz,
    is_open boolean,
    brand_domain text,
    brand_name text,
    brand_logo_path text,
    member_count integer,
    requests_waiting_on_team integer,
    last_lender_activity_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  with room as (
    select r.*, public.lender_room_is_open(r) as is_open, d.description as deal_description, f.name::text as deal_name
    from public.deal d
    join public.lender_room r on r.deal_id = d.id
    left join public.firm f on f.id = d.firm_id
    where d.account_id = team_lender_rooms.account_id
      and public.has_permission((select auth.uid()), team_lender_rooms.account_id, 'deals.manage')
  ),
  ask as (
    select k.room_id,
      k.status = 'open' and not coalesce(k.return_route = 'esign' and s.status = 'sent', false) as waiting_on_team,
      k.created_at
    from public.lender_ask k
    join room on room.id = k.room_id
    left join lateral (
      select s.status from public.lender_form_signature s
      where s.ask_id = k.id
      order by s.created_at desc
      limit 1
    ) s on true
  ),
  lender_touch as (
    select a.room_id, a.created_at from public.lender_room_activity a
    join room on room.id = a.room_id
    where a.side = 'lender'
    union all
    select ask.room_id, ask.created_at from ask
    union all
    select k.room_id, msg.created_at from public.lender_ask_message msg
    join public.lender_ask k on k.id = msg.ask_id
    join room on room.id = k.room_id
    where msg.side = 'lender'
    union all
    select u.room_id, u.registered_at from public.lender_upload u
    join room on room.id = u.room_id
    where u.registered_at is not null
  )
  select
    room.id, room.deal_id, room.deal_name, room.deal_description, room.name, room.status,
    room.expires_at, room.closed_at, room.is_open, room.brand_domain, b.name, b.logo_path,
    (select count(*)::integer from public.lender_room_member m where m.room_id = room.id),
    (select count(*)::integer from ask where ask.room_id = room.id and ask.waiting_on_team),
    (select max(t.created_at) from lender_touch t where t.room_id = room.id)
  from room
  left join public.lender_brand b on b.domain = room.brand_domain;
$$;

grant execute on function public.team_lender_rooms(uuid) to authenticated, service_role;

-- One row per lender per room on a team's deals, present or removed. A person
-- removed and invited again shows once, as present; one removed for good
-- shows with their latest removal. A removal record does not keep who sent
-- the invitation, so invited_by is null for a removed person. The request
-- counts cover only the requests that person opened.
create or replace function public.team_lender_contacts(account_id uuid)
  returns table (
    user_id uuid,
    email text,
    name text,
    has_signed_in boolean,
    room_id uuid,
    room_name text,
    deal_id uuid,
    deal_name text,
    deal_description text,
    room_status public.lender_room_status,
    brand_name text,
    brand_logo_path text,
    invited_by uuid,
    invited_by_email text,
    invited_by_name text,
    invited_at timestamptz,
    removed_at timestamptz,
    first_visit_at timestamptz,
    last_visit_at timestamptz,
    files_viewed integer,
    downloads integer,
    requests_opened integer,
    requests_waiting_on_team integer,
    requests_waiting_on_lender integer,
    forms_out_for_signature integer
  )
  language sql stable security definer
  set search_path = '' as $$
  with room as (
    select r.id, r.name, r.deal_id, r.status, r.brand_domain, f.name::text as deal_name, d.description as deal_description
    from public.deal d
    join public.lender_room r on r.deal_id = d.id
    left join public.firm f on f.id = d.firm_id
    where d.account_id = team_lender_contacts.account_id
      and public.has_permission((select auth.uid()), team_lender_contacts.account_id, 'deals.manage')
  ),
  person as (
    select m.room_id, m.user_id, m.invited_by, m.created_at as invited_at, null::timestamptz as removed_at
    from public.lender_room_member m
    join room on room.id = m.room_id
    union all
    (
      select distinct on (rm.room_id, rm.user_id) rm.room_id, rm.user_id, null::uuid, rm.invited_at, rm.removed_at
      from public.lender_room_removed_member rm
      join room on room.id = rm.room_id
      where not exists (
        select 1 from public.lender_room_member m
        where m.room_id = rm.room_id and m.user_id = rm.user_id
      )
      order by rm.room_id, rm.user_id, rm.removed_at desc
    )
  ),
  ask as (
    select k.room_id, k.created_by,
      k.status = 'open' and not coalesce(k.return_route = 'esign' and s.status = 'sent', false) as waiting_on_team,
      k.status = 'answered' as waiting_on_lender,
      k.status = 'open' and coalesce(k.return_route = 'esign' and s.status = 'sent', false) as out_for_signature
    from public.lender_ask k
    join room on room.id = k.room_id
    left join lateral (
      select s.status from public.lender_form_signature s
      where s.ask_id = k.id
      order by s.created_at desc
      limit 1
    ) s on true
  ),
  opened as (
    select ask.room_id, ask.created_by,
      count(*)::integer as requests,
      count(*) filter (where ask.waiting_on_team)::integer as waiting_on_team,
      count(*) filter (where ask.waiting_on_lender)::integer as waiting_on_lender,
      count(*) filter (where ask.out_for_signature)::integer as out_for_signature
    from ask
    group by ask.room_id, ask.created_by
  ),
  seen as (
    select a.room_id, a.user_id,
      min(a.created_at) filter (where a.action = 'room_opened') as first_visit_at,
      max(a.created_at) filter (where a.action = 'room_opened') as last_visit_at,
      count(distinct a.dr_document_id) filter (where a.action = 'document_previewed')::integer as files_viewed,
      (count(distinct a.dr_document_id) filter (where a.action = 'document_downloaded')
        + count(*) filter (where a.action = 'zip_downloaded'))::integer as downloads
    from public.lender_room_activity a
    join room on room.id = a.room_id
    group by a.room_id, a.user_id
  )
  select
    p.user_id, u.email::text, lp.name, u.last_sign_in_at is not null,
    room.id, room.name, room.deal_id, room.deal_name, room.deal_description, room.status, b.name, b.logo_path,
    p.invited_by, inviter.email::text, inviter_account.name::text, p.invited_at, p.removed_at,
    seen.first_visit_at, seen.last_visit_at,
    coalesce(seen.files_viewed, 0), coalesce(seen.downloads, 0),
    coalesce(opened.requests, 0),
    coalesce(opened.waiting_on_team, 0), coalesce(opened.waiting_on_lender, 0), coalesce(opened.out_for_signature, 0)
  from person p
  join room on room.id = p.room_id
  join auth.users u on u.id = p.user_id
  left join public.lender_person lp on lp.user_id = p.user_id
  left join auth.users inviter on inviter.id = p.invited_by
  left join public.accounts inviter_account
    on inviter_account.primary_owner_user_id = p.invited_by and inviter_account.is_personal_account
  left join public.lender_brand b on b.domain = room.brand_domain
  left join seen on seen.room_id = p.room_id and seen.user_id = p.user_id
  left join opened on opened.room_id = p.room_id and opened.created_by = p.user_id;
$$;

grant execute on function public.team_lender_contacts(uuid) to authenticated, service_role;

create policy dr_folder_read on public.dr_folder
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
    or (
      deal_id = any ((select public.lender_open_room_deal_ids())::uuid[])
      and public.lender_can_read_folder(id)
    )
  );

create policy dr_document_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and (
      public.has_role_on_account(account_id)
      or public.has_deal_permission(deal_id, 'deals.manage')
      or (
        deal_id = any ((select public.lender_open_room_deal_ids())::uuid[])
        and public.lender_can_read_document(id)
      )
    )
  );

-- No policy for signed-in users on this bucket, and none for lenders on the
-- data-room bucket: logos and files are served by server code, files through
-- a route that records the access.
insert into storage.buckets (id, name, public)
values ('lender-brand', 'lender-brand', false)
on conflict (id) do nothing;
