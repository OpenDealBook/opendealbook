-- Seller rooms: one per deal, shared by every seller the team invites. The
-- team picks which data-room folders and meetings appear; sellers read those,
-- drop files into one shared uploads folder, and answer the team's questions.
-- A question may come from a lender ask; which one is kept in a table sellers
-- cannot read, so no lender is ever named to a seller.

create type public.seller_side as enum ('seller', 'internal');
create type public.seller_room_question_status as enum ('open', 'answered', 'closed', 'withdrawn');
create type public.seller_activity_action as enum (
  'room_opened', 'folder_opened', 'document_previewed', 'document_downloaded',
  'zip_downloaded', 'document_uploaded', 'meeting_opened', 'question_answered',
  'folder_created'
);

-- Open is worked out on every read: not closed by the team and the deal not
-- archived. Deleting the deal deletes the room.
create table if not exists public.seller_room (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null unique references public.deal (id) on delete cascade,
  uploads_folder_id uuid not null references public.dr_folder (id),
  welcome_note text,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (id, account_id),
  unique (id, deal_id)
);

alter table public.seller_room enable row level security;

revoke all on public.seller_room from anon, authenticated, service_role;
grant select on public.seller_room to authenticated;
grant update (welcome_note, closed_at) on public.seller_room to authenticated;
grant select, insert, update, delete on public.seller_room to service_role;

create trigger seller_room_timestamps
  before insert or update on public.seller_room
  for each row execute function public.set_timestamps();

create trigger seller_room_user_tracking
  before insert or update on public.seller_room
  for each row execute function public.set_user_tracking();

create table if not exists public.seller_room_member (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.seller_room (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  name text not null,
  invited_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists ix_seller_room_member_user on public.seller_room_member (user_id);

alter table public.seller_room_member enable row level security;

revoke all on public.seller_room_member from anon, authenticated, service_role;
grant select, insert, delete on public.seller_room_member to authenticated;
grant select, insert, update, delete on public.seller_room_member to service_role;

create table if not exists public.seller_room_removed_member (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.seller_room (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  invited_at timestamptz not null,
  removed_at timestamptz not null default now(),
  removed_by uuid references auth.users
);

alter table public.seller_room_removed_member enable row level security;

revoke all on public.seller_room_removed_member from anon, authenticated, service_role;
grant select on public.seller_room_removed_member to authenticated;
grant select, insert, update, delete on public.seller_room_removed_member to service_role;

-- A member row that goes because its room or its user is being deleted
-- leaves no record: the join finds neither.
create or replace function public.record_seller_room_removal()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  insert into public.seller_room_removed_member (room_id, user_id, email, invited_at, removed_by)
  select old.room_id, old.user_id, old.email, old.created_at, (select auth.uid())
  from public.seller_room r
  join auth.users u on u.id = old.user_id
  where r.id = old.room_id;
  return old;
end;
$$;

create trigger seller_room_member_removal
  after delete on public.seller_room_member
  for each row execute function public.record_seller_room_removal();

create table if not exists public.seller_room_folder (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.seller_room (id) on delete cascade,
  dr_folder_id uuid not null references public.dr_folder (id) on delete cascade,
  unique (room_id, dr_folder_id)
);

alter table public.seller_room_folder enable row level security;

revoke all on public.seller_room_folder from anon, authenticated, service_role;
grant select, insert, delete on public.seller_room_folder to authenticated;
grant select, insert, update, delete on public.seller_room_folder to service_role;

-- No foreign key on meeting_id: replay_deal deletes a deal's meetings and puts
-- them back under the same ids, and sharing must survive that.
create table if not exists public.seller_room_meeting (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.seller_room (id) on delete cascade,
  meeting_id uuid not null,
  unique (room_id, meeting_id)
);

alter table public.seller_room_meeting enable row level security;

revoke all on public.seller_room_meeting from anon, authenticated, service_role;
grant select, insert, delete on public.seller_room_meeting to authenticated;
grant select, insert, update, delete on public.seller_room_meeting to service_role;

create table if not exists public.seller_room_question (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  title text not null,
  body text,
  status public.seller_room_question_status not null default 'open',
  first_response_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (room_id, account_id) references public.seller_room (id, account_id) on delete cascade
);

create index if not exists ix_seller_room_question_room on public.seller_room_question (room_id);

alter table public.seller_room_question enable row level security;

revoke all on public.seller_room_question from anon, authenticated, service_role;
grant select, insert, update on public.seller_room_question to authenticated;
grant select, insert, update, delete on public.seller_room_question to service_role;

create table if not exists public.seller_room_question_route (
  question_id uuid primary key references public.seller_room_question (id) on delete cascade,
  lender_ask_id uuid not null references public.lender_ask (id) on delete cascade
);

alter table public.seller_room_question_route enable row level security;

revoke all on public.seller_room_question_route from anon, authenticated, service_role;
grant select, insert, delete on public.seller_room_question_route to authenticated;
grant select, insert, update, delete on public.seller_room_question_route to service_role;

create table if not exists public.seller_room_question_message (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.seller_room_question (id) on delete cascade,
  author_user_id uuid references auth.users default auth.uid(),
  side public.seller_side not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.seller_room_question_message enable row level security;

revoke all on public.seller_room_question_message from anon, authenticated, service_role;
grant select, insert on public.seller_room_question_message to authenticated;
grant select, insert, update, delete on public.seller_room_question_message to service_role;

-- No foreign key on dr_document_id, as in lender rooms: replay_deal deletes a
-- deal's documents and puts them back under the same ids.
create table if not exists public.seller_room_question_file (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.seller_room_question (id) on delete cascade,
  dr_document_id uuid not null,
  side public.seller_side not null,
  added_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.seller_room_question_file enable row level security;

revoke all on public.seller_room_question_file from anon, authenticated, service_role;
grant select, insert on public.seller_room_question_file to authenticated;
grant select, insert, update, delete on public.seller_room_question_file to service_role;

create table if not exists public.seller_room_activity (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  user_id uuid references auth.users default auth.uid(),
  side public.seller_side not null,
  action public.seller_activity_action not null,
  dr_document_id uuid,
  dr_folder_id uuid,
  payload jsonb,
  created_at timestamptz not null default now(),
  foreign key (room_id, account_id) references public.seller_room (id, account_id) on delete cascade
);

alter table public.seller_room_activity enable row level security;

revoke all on public.seller_room_activity from anon, authenticated, service_role;
grant select, insert on public.seller_room_activity to authenticated;
grant select, insert, update, delete on public.seller_room_activity to service_role;

-- Registering reads the storage key from this row, never from the caller.
create table if not exists public.seller_upload (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  deal_id uuid not null references public.deal (id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  registered_at timestamptz,
  document_ids uuid[],
  folder_id uuid not null references public.dr_folder (id) on delete cascade,
  keep_as_zip boolean,
  foreign key (room_id, deal_id) references public.seller_room (id, deal_id) on delete cascade
);

alter table public.seller_upload enable row level security;

revoke all on public.seller_upload from anon, authenticated, service_role;
grant select, insert, update, delete on public.seller_upload to service_role;

alter table public.document_share
  add column if not exists room_id uuid references public.seller_room (id) on delete set null;

create or replace function public.seller_room_is_open(room public.seller_room)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select room.closed_at is null
    and exists (
      select 1 from public.deal d
      where d.id = room.deal_id and d.archived_at is null
    );
$$;

revoke all on function public.seller_room_is_open(public.seller_room) from public, anon, authenticated;
grant execute on function public.seller_room_is_open(public.seller_room) to service_role;

create or replace function public.can_manage_seller_room(room_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.seller_room r
    where r.id = can_manage_seller_room.room_id
      and public.manages_deal_in_account(r.deal_id, r.account_id)
  );
$$;

grant execute on function public.can_manage_seller_room(uuid) to authenticated, service_role;

create or replace function public.can_ask_in_seller_room(room_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.seller_room r
    where r.id = can_ask_in_seller_room.room_id
      and public.has_deal_permission(r.deal_id, 'deals.work')
  );
$$;

grant execute on function public.can_ask_in_seller_room(uuid) to authenticated, service_role;

create or replace function public.seller_room_id_for_work(deal_id uuid)
  returns uuid
  language sql stable security definer
  set search_path = '' as $$
  select r.id from public.seller_room r
  where r.deal_id = seller_room_id_for_work.deal_id
    and public.has_deal_permission(r.deal_id, 'deals.work');
$$;

revoke all on function public.seller_room_id_for_work(uuid) from public, anon;
grant execute on function public.seller_room_id_for_work(uuid) to authenticated, service_role;

-- Sellers keep reading their room once it closes or the deal ends, and
-- seller's counsel while the deal is open; writing stops then (see 99w).
-- plpgsql so the body is not checked here: is_deal_counsel loads later, in 99f.
create or replace function public.is_seller_room_member(room_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return exists (
    select 1
    from public.seller_room r
    where r.id = is_seller_room_member.room_id
      and (
        exists (
          select 1 from public.seller_room_member m
          where m.room_id = r.id and m.user_id = (select auth.uid())
        )
        or public.is_deal_counsel(r.deal_id, 'seller')
      )
  );
end;
$$;

grant execute on function public.is_seller_room_member(uuid) to authenticated, service_role;

-- What one room shows of the data room, whoever is asking: the subtree of its
-- uploads folder and of each folder the team picked, on the room's own deal.
create or replace function public.seller_room_shows_folder_unchecked(room_id uuid, folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  with recursive ancestry as (
    select f.id, f.parent_id
    from public.dr_folder f
    where f.id = seller_room_shows_folder_unchecked.folder_id
    union all
    select p.id, p.parent_id
    from public.dr_folder p
    join ancestry a on p.id = a.parent_id
  )
  select exists (
    select 1
    from public.seller_room r
    join public.dr_folder f on f.id = seller_room_shows_folder_unchecked.folder_id and f.deal_id = r.deal_id
    where r.id = seller_room_shows_folder_unchecked.room_id
      and exists (
        select 1 from ancestry a
        where a.id = r.uploads_folder_id
          or a.id in (select sf.dr_folder_id from public.seller_room_folder sf where sf.room_id = r.id)
      )
      and not exists (
        select 1 from ancestry a
        where a.id in (select lr.private_folder_id from public.lender_room lr where lr.deal_id = r.deal_id)
          or a.id in (select lp.master_folder_id from public.lender_package lp where lp.deal_id = r.deal_id)
      )
  );
$$;

-- A lender room's own folder or the lender package, or a folder beneath
-- either: never shown in a seller room.
create or replace function public.is_lender_folder(folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  with recursive ancestry as (
    select f.id, f.parent_id from public.dr_folder f where f.id = is_lender_folder.folder_id
    union all
    select p.id, p.parent_id from public.dr_folder p join ancestry a on p.id = a.parent_id
  )
  select exists (
    select 1 from ancestry a
    where a.id in (select lr.private_folder_id from public.lender_room lr)
      or a.id in (select lp.master_folder_id from public.lender_package lp)
  );
$$;

grant execute on function public.is_lender_folder(uuid) to authenticated, service_role;

create or replace function public.seller_room_shows_document(room_id uuid, document_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_seller_room_member(seller_room_shows_document.room_id)
    and exists (
      select 1
      from public.dr_document d
      join public.seller_room r on r.id = seller_room_shows_document.room_id and r.deal_id = d.deal_id
      where d.id = seller_room_shows_document.document_id
        and d.removed_at is null
        and public.seller_room_shows_folder_unchecked(r.id, d.folder_id)
    );
$$;

grant execute on function public.seller_room_shows_document(uuid, uuid) to authenticated, service_role;

-- The deals whose room the caller reads, tested once per statement by the data
-- room read policies: every room they sell in, open or not, and rooms they are
-- seller's counsel on while the deal is open.
-- plpgsql so the body is not checked here: is_deal_counsel loads later, in 99f.
create or replace function public.seller_room_deal_ids()
  returns uuid[]
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return (
    select coalesce(array_agg(distinct r.deal_id), '{}')
    from public.seller_room r
    where r.id in (select m.room_id from public.seller_room_member m where m.user_id = (select auth.uid()))
      or public.is_deal_counsel(r.deal_id, 'seller')
  );
end;
$$;

grant execute on function public.seller_room_deal_ids() to authenticated, service_role;

create or replace function public.seller_can_read_folder(folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.dr_folder f
    join public.seller_room r on r.deal_id = f.deal_id
    where f.id = seller_can_read_folder.folder_id
      and public.is_seller_room_member(r.id)
      and public.seller_room_shows_folder_unchecked(r.id, f.id)
  );
$$;

grant execute on function public.seller_can_read_folder(uuid) to authenticated, service_role;

create or replace function public.seller_can_read_document(document_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.dr_document d
    where d.id = seller_can_read_document.document_id
      and d.removed_at is null
      and public.seller_can_read_folder(d.folder_id)
  );
$$;

grant execute on function public.seller_can_read_document(uuid) to authenticated, service_role;

create policy dr_folder_seller_read on public.dr_folder
  for select to authenticated
  using (
    deal_id = any ((select public.seller_room_deal_ids())::uuid[])
    and public.seller_can_read_folder(id)
  );

create policy dr_document_seller_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and deal_id = any ((select public.seller_room_deal_ids())::uuid[])
    and public.seller_can_read_document(id)
  );

create policy seller_room_read on public.seller_room
  for select to authenticated
  using (
    public.can_manage_seller_room(id)
    or exists (
      select 1 from public.seller_room_member m
      where m.room_id = seller_room.id and m.user_id = (select auth.uid())
    )
    or public.is_seller_room_member(id)
  );

create policy seller_room_update on public.seller_room
  for update to authenticated
  using (public.can_manage_seller_room(id))
  with check (public.can_manage_seller_room(id));

-- Sellers in one room are legal partners: each sees the others' names and
-- emails. Deal managers see them too; analysts see only names, through
-- seller_room_names.
create policy seller_room_member_read on public.seller_room_member
  for select to authenticated
  using (
    public.can_manage_seller_room(room_id)
    or user_id = (select auth.uid())
    or public.is_seller_room_member(room_id)
  );

create or replace function public.seller_room_names(deal_id uuid)
  returns table (id uuid, name text, created_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select m.id, m.name, m.created_at
  from public.seller_room_member m
  where m.room_id = public.seller_room_id_for_work(seller_room_names.deal_id);
$$;

revoke all on function public.seller_room_names(uuid) from public, anon;
grant execute on function public.seller_room_names(uuid) to authenticated, service_role;

create policy seller_room_member_insert on public.seller_room_member
  for insert to authenticated
  with check (public.can_manage_seller_room(room_id));

create policy seller_room_member_delete on public.seller_room_member
  for delete to authenticated
  using (public.can_manage_seller_room(room_id));

create policy seller_room_removed_member_read on public.seller_room_removed_member
  for select to authenticated
  using (public.can_manage_seller_room(room_id));

create policy seller_room_folder_read on public.seller_room_folder
  for select to authenticated
  using (public.can_manage_seller_room(room_id) or public.is_seller_room_member(room_id));

create policy seller_room_folder_insert on public.seller_room_folder
  for insert to authenticated
  with check (
    public.can_manage_seller_room(room_id)
    and not public.is_lender_folder(dr_folder_id)
    and exists (
      select 1 from public.seller_room r
      join public.dr_folder f on f.id = seller_room_folder.dr_folder_id and f.deal_id = r.deal_id
      where r.id = seller_room_folder.room_id
    )
  );

create policy seller_room_folder_delete on public.seller_room_folder
  for delete to authenticated
  using (public.can_manage_seller_room(room_id));

create policy seller_room_meeting_read on public.seller_room_meeting
  for select to authenticated
  using (public.can_manage_seller_room(room_id) or public.is_seller_room_member(room_id));

create policy seller_room_meeting_insert on public.seller_room_meeting
  for insert to authenticated
  with check (
    public.can_manage_seller_room(room_id)
    and exists (
      select 1 from public.seller_room r
      join public.meeting mt on mt.id = seller_room_meeting.meeting_id and mt.deal_id = r.deal_id
      where r.id = seller_room_meeting.room_id
    )
  );

create policy seller_room_meeting_delete on public.seller_room_meeting
  for delete to authenticated
  using (public.can_manage_seller_room(room_id));

create policy seller_room_question_read on public.seller_room_question
  for select to authenticated
  using (public.can_ask_in_seller_room(room_id) or public.is_seller_room_member(room_id));

create policy seller_room_question_insert on public.seller_room_question
  for insert to authenticated
  with check (public.can_ask_in_seller_room(room_id));

create policy seller_room_question_update on public.seller_room_question
  for update to authenticated
  using (public.can_manage_seller_room(room_id))
  with check (public.can_manage_seller_room(room_id));

create policy seller_room_question_route_read on public.seller_room_question_route
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_route.question_id
        and public.can_ask_in_seller_room(q.room_id)
    )
  );

create or replace function public.can_route_lender_ask_to_seller(question_id uuid, lender_ask_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.seller_room_question q
    join public.seller_room r on r.id = q.room_id
    join public.lender_ask a on a.id = can_route_lender_ask_to_seller.lender_ask_id
    join public.lender_room lr on lr.id = a.room_id and lr.deal_id = r.deal_id
    where q.id = can_route_lender_ask_to_seller.question_id
      and public.can_ask_in_seller_room(q.room_id)
  );
$$;

revoke all on function public.can_route_lender_ask_to_seller(uuid, uuid) from public, anon;
grant execute on function public.can_route_lender_ask_to_seller(uuid, uuid) to authenticated, service_role;

create policy seller_room_question_route_insert on public.seller_room_question_route
  for insert to authenticated
  with check (public.can_route_lender_ask_to_seller(question_id, lender_ask_id));

create policy seller_room_question_route_delete on public.seller_room_question_route
  for delete to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_route.question_id
        and public.can_manage_seller_room(q.room_id)
    )
  );

create policy seller_room_question_message_read on public.seller_room_question_message
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_message.question_id
        and (public.can_ask_in_seller_room(q.room_id) or public.is_seller_room_member(q.room_id))
    )
  );

create policy seller_room_question_message_insert on public.seller_room_question_message
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_message.question_id
        and (
          (side = 'seller' and public.is_seller_room_member(q.room_id))
          or (side = 'internal' and public.can_manage_seller_room(q.room_id))
        )
    )
  );

create policy seller_room_question_file_read on public.seller_room_question_file
  for select to authenticated
  using (
    exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_file.question_id
        and (public.can_ask_in_seller_room(q.room_id) or public.is_seller_room_member(q.room_id))
    )
  );

create policy seller_room_question_file_insert on public.seller_room_question_file
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.seller_room_question q
      where q.id = seller_room_question_file.question_id
        and (
          (side = 'seller'
            and public.seller_room_shows_document(q.room_id, seller_room_question_file.dr_document_id))
          or (side = 'internal' and public.can_manage_seller_room(q.room_id))
        )
    )
  );

create policy seller_room_activity_read on public.seller_room_activity
  for select to authenticated
  using (public.can_manage_seller_room(room_id));

create policy seller_room_activity_insert on public.seller_room_activity
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and side = 'internal'
    and public.can_manage_seller_room(room_id)
  );

create policy document_share_seller_room_read on public.document_share
  for select to authenticated
  using (room_id is not null and public.is_seller_room_member(room_id));

create or replace function public.ensure_seller_room(deal_id uuid)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  deal_account uuid;
  room uuid;
  folder uuid;
begin
  select d.account_id into deal_account from public.deal d where d.id = ensure_seller_room.deal_id;

  if deal_account is null or not public.manages_deal_in_account(ensure_seller_room.deal_id, deal_account) then
    raise exception 'not allowed to manage this deal' using errcode = 'insufficient_privilege';
  end if;

  select r.id into room from public.seller_room r where r.deal_id = ensure_seller_room.deal_id;

  if room is not null then
    return room;
  end if;

  insert into public.dr_folder (account_id, deal_id, parent_id, name)
  values (deal_account, ensure_seller_room.deal_id, null, 'Seller uploads')
  returning id into folder;

  insert into public.seller_room (account_id, deal_id, uploads_folder_id)
  values (deal_account, ensure_seller_room.deal_id, folder)
  on conflict on constraint seller_room_deal_id_key do nothing
  returning id into room;

  if room is null then
    delete from public.dr_folder where id = folder;
    select r.id into room from public.seller_room r where r.deal_id = ensure_seller_room.deal_id;
  end if;

  return room;
end;
$$;

revoke all on function public.ensure_seller_room(uuid) from public, anon;
grant execute on function public.ensure_seller_room(uuid) to authenticated, service_role;

-- plpgsql so the body is not checked here: is_deal_counsel loads later, in 99f.
create or replace function public.my_seller_rooms()
  returns table (
    id uuid,
    deal_id uuid,
    deal_name text,
    team_name text,
    team_picture_url text,
    is_open boolean
  )
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select r.id, r.deal_id, f.name::text, a.name::text, a.picture_url::text, public.seller_room_is_open(r)
  from public.seller_room r
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = r.account_id
  where exists (
      select 1 from public.seller_room_member m
      where m.room_id = r.id and m.user_id = (select auth.uid())
    )
    or public.is_deal_counsel(r.deal_id, 'seller')
  order by a.name, f.name;
end;
$$;

revoke all on function public.my_seller_rooms() from public, anon;
grant execute on function public.my_seller_rooms() to authenticated, service_role;

create or replace function public.seller_room_view(room_id uuid)
  returns table (
    id uuid,
    deal_id uuid,
    deal_name text,
    team_name text,
    team_picture_url text,
    is_open boolean,
    welcome_note text,
    uploads_folder_id uuid
  )
  language sql stable security definer
  set search_path = '' as $$
  select r.id, r.deal_id, f.name::text, a.name::text, a.picture_url::text,
    public.seller_room_is_open(r), r.welcome_note, r.uploads_folder_id
  from public.seller_room r
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = r.account_id
  where r.id = seller_room_view.room_id
    and (
      public.can_manage_seller_room(r.id)
      or exists (
        select 1 from public.seller_room_member m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.seller_room_view(uuid) from public, anon;
grant execute on function public.seller_room_view(uuid) to authenticated, service_role;

-- A shared meeting as the seller sees it: transcript and summary, never the
-- recording or action items.
create or replace function public.seller_room_meetings(room_id uuid)
  returns table (
    id uuid,
    type text,
    scheduled_at timestamptz,
    transcript_text text,
    summary text
  )
  language sql stable security definer
  set search_path = '' as $$
  select mt.id, mt.type, mt.scheduled_at, mt.transcript_text, mt.summary
  from public.seller_room_meeting sm
  join public.meeting mt on mt.id = sm.meeting_id
  where sm.room_id = seller_room_meetings.room_id
    and (
      public.is_seller_room_member(seller_room_meetings.room_id)
      or public.can_manage_seller_room(seller_room_meetings.room_id)
    )
  order by mt.scheduled_at desc nulls last;
$$;

revoke all on function public.seller_room_meetings(uuid) from public, anon;
grant execute on function public.seller_room_meetings(uuid) to authenticated, service_role;

-- Here rather than in 99c-billing-lock.sql because these tables are created
-- above. 'members' refuses only the team's own writes, so sellers keep
-- answering and uploading while the team is locked.

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('seller_room_activity', 'recorded when people view a room')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.document_share
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_member
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'seller_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_removed_member
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'seller_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_folder
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'seller_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_meeting
  for each row execute function odb.refuse_write_when_team_locked('members', 'room_id', 'seller_room');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_question
  for each row execute function odb.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_question_route
  for each row execute function odb.refuse_write_when_team_locked('members', 'question_id', 'seller_room_question');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_question_message
  for each row execute function odb.refuse_write_when_team_locked('members', 'question_id', 'seller_room_question');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_room_question_file
  for each row execute function odb.refuse_write_when_team_locked('members', 'question_id', 'seller_room_question');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_upload
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

-- Rows never move to another team. seller_send_limit's guard lives here
-- because its own file, 38a, runs before 99c defines the guard.
create trigger refuse_team_move
  before update on public.seller_room_activity
  for each row execute function odb.refuse_team_move();

create trigger refuse_team_move
  before update on public.seller_send_limit
  for each row execute function odb.refuse_team_move();

create trigger same_team_generated_document_id
  before insert or update on public.document_share
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'generated_document_id', 'generated_document');

create trigger same_team_room_id
  before insert or update on public.document_share
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'room_id', 'seller_room');

create trigger same_team_deal_id
  before insert or update on public.seller_room
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_uploads_folder_id
  before insert or update on public.seller_room
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'uploads_folder_id', 'dr_folder');

create trigger same_team_dr_folder_id
  before insert or update on public.seller_room_folder
  for each row execute function odb.refuse_cross_team_link('room_id', 'seller_room', 'dr_folder_id', 'dr_folder');

create trigger same_team_meeting_id
  before insert or update on public.seller_room_meeting
  for each row execute function odb.refuse_cross_team_link('room_id', 'seller_room', 'meeting_id', 'meeting');

create trigger same_team_lender_ask_id
  before insert or update on public.seller_room_question_route
  for each row execute function odb.refuse_cross_team_link('question_id', 'seller_room_question', 'lender_ask_id', 'lender_ask');

create trigger same_team_folder_id
  before insert or update on public.seller_upload
  for each row execute function odb.refuse_cross_team_link('deal_id', 'deal', 'folder_id', 'dr_folder');

create policy lender_oversize_file_seller_read on public.lender_oversize_file
  for select to authenticated
  using (public.seller_can_read_folder(dr_folder_id));

create or replace function public.seller_room_documents(room_id uuid)
  returns table (
    share_id uuid,
    template_name text,
    firm_name text,
    sent_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select s.id, t.name, f.name::text, s.sent_at
  from public.document_share s
  join public.generated_document g on g.id = s.generated_document_id
  left join public.document_template t on t.id = g.template_id
  join public.deal d on d.id = g.deal_id
  left join public.firm f on f.id = d.firm_id
  where s.room_id = seller_room_documents.room_id
    and (
      public.is_seller_room_member(seller_room_documents.room_id)
      or public.can_manage_seller_room(seller_room_documents.room_id)
    )
  order by s.sent_at desc nulls last;
$$;

revoke all on function public.seller_room_documents(uuid) from public, anon;
grant execute on function public.seller_room_documents(uuid) to authenticated, service_role;

create or replace function public.refuse_deleting_seller_uploads_folder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (select 1 from public.seller_room r where r.uploads_folder_id = old.id)
    and exists (select 1 from public.deal d where d.id = old.deal_id) then
    raise exception 'This folder holds the sellers'' uploads and cannot be deleted while the seller room exists'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger seller_uploads_folder_kept
  before delete on public.dr_folder
  for each row execute function public.refuse_deleting_seller_uploads_folder();

-- Seller questions from the portal before seller rooms, read-only in the room.
create or replace function public.seller_room_legacy_questions(room_id uuid)
  returns table (id uuid, question text, answer text, answered_at timestamptz)
  language sql stable security definer
  set search_path = '' as $$
  select q.id, q.question, q.answer, q.answered_at
  from public.seller_question q
  join public.seller_room r on r.deal_id = q.deal_id
  where r.id = seller_room_legacy_questions.room_id
    and (
      public.is_seller_room_member(r.id)
      or public.can_manage_seller_room(r.id)
    )
  order by q.created_at nulls last;
$$;

revoke all on function public.seller_room_legacy_questions(uuid) from public, anon;
grant execute on function public.seller_room_legacy_questions(uuid) to authenticated, service_role;

-- Sellers of open rooms that show a document. A seller's own upload is never
-- announced to the other sellers; a file the team adds anywhere the room shows
-- is. Service role only.
create or replace function public.seller_document_recipients(document_id uuid)
  returns table (room_id uuid, user_id uuid, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.room_id, m.user_id, m.email
  from public.dr_document d
  join public.seller_room r on r.deal_id = d.deal_id
  join public.seller_room_member m on m.room_id = r.id
  where d.id = seller_document_recipients.document_id
    and d.removed_at is null
    and public.seller_room_is_open(r)
    and public.seller_room_shows_folder_unchecked(r.id, d.folder_id)
    and not exists (
      select 1 from public.seller_room_member uploader
      where uploader.room_id = r.id and uploader.user_id = d.uploaded_by
    );
$$;

revoke all on function public.seller_document_recipients(uuid) from public, anon, authenticated;
grant execute on function public.seller_document_recipients(uuid) to service_role;

-- What a seller's digest may still name, looked up at send time for the person
-- named: files the room still shows, folders still picked, meetings still
-- shared, in open rooms they belong to. Service role only.
create or replace function public.seller_digest_items(
  user_id uuid,
  document_ids uuid[],
  folder_ids uuid[],
  meeting_ids uuid[]
)
  returns table (
    kind text,
    item_id uuid,
    name text,
    folder_id uuid,
    scheduled_at timestamptz,
    room_id uuid,
    team_name text
  )
  language sql stable security definer
  set search_path = '' as $$
  with rooms as (
    select r.*, a.name::text as team_name
    from public.seller_room_member m
    join public.seller_room r on r.id = m.room_id
    join public.accounts a on a.id = r.account_id
    where m.user_id = seller_digest_items.user_id
      and public.seller_room_is_open(r)
  )
  select 'document', d.id, d.name, d.folder_id, null::timestamptz, r.id, r.team_name
  from public.dr_document d
  join rooms r on r.deal_id = d.deal_id
  where d.id = any (seller_digest_items.document_ids)
    and d.removed_at is null
    and public.seller_room_shows_folder_unchecked(r.id, d.folder_id)
  union all
  select 'folder', f.id, f.name, null, null, r.id, r.team_name
  from public.seller_room_folder sf
  join rooms r on r.id = sf.room_id
  join public.dr_folder f on f.id = sf.dr_folder_id
  where sf.dr_folder_id = any (seller_digest_items.folder_ids)
    and not public.is_lender_folder(f.id)
  union all
  select 'meeting', mt.id, mt.type, null, mt.scheduled_at, r.id, r.team_name
  from public.seller_room_meeting sm
  join rooms r on r.id = sm.room_id
  join public.meeting mt on mt.id = sm.meeting_id
  where sm.meeting_id = any (seller_digest_items.meeting_ids);
$$;

revoke all on function public.seller_digest_items(uuid, uuid[], uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.seller_digest_items(uuid, uuid[], uuid[], uuid[]) to service_role;

-- What a room's sellers have been told about, so a folder or meeting hidden
-- and shown again is not announced twice. Server code only.
create table if not exists public.seller_room_announcement (
  room_id uuid not null references public.seller_room (id) on delete cascade,
  kind text not null check (kind in ('folder', 'meeting')),
  item_id uuid not null,
  announced_at timestamptz not null default now(),
  primary key (room_id, kind, item_id)
);

alter table public.seller_room_announcement enable row level security;

revoke all on public.seller_room_announcement from anon, authenticated, service_role;
grant select, insert on public.seller_room_announcement to service_role;

insert into odb.billing_lock_exempt_tables (table_name, reason) values
  ('seller_room_announcement', 'service-role only, records what sellers were told')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.seller_room_announcement
  for each row execute function odb.refuse_team_move();
