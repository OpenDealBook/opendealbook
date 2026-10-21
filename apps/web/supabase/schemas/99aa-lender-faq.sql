-- Lender FAQ. The deal team turns answered lender asks into rewritten entries
-- shown in every lender room on the deal, except rooms it hides an entry
-- from. What a room shows is worked out on every read, so rooms made later get
-- the whole FAQ and unpublishing reaches every room at once.
--
-- Entry files are their own storage objects, copied at publish under a fresh
-- key, so nothing about the asking room reaches other lenders. Lenders read
-- none of these tables: lender_room_faq and lender_room_shows_faq_file answer
-- for them, and never name the source ask.
--
-- This file sorts before 99c-billing-lock.sql, which locks these tables.

create type public.lender_faq_status as enum ('draft', 'published', 'unpublished');

create table if not exists public.lender_faq_entry (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  question text not null check (char_length(question) <= 5000),
  answer text not null check (char_length(answer) <= 5000),
  status public.lender_faq_status not null default 'draft',
  first_published_at timestamptz,
  pinned boolean not null default false,
  -- A content save names the version it edited; a stale one is refused.
  version integer not null default 1,
  search_tsv tsvector not null default ''::tsvector,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, deal_id),
  check ((status = 'draft') = (first_published_at is null))
);

create index if not exists lender_faq_entry_deal on public.lender_faq_entry (deal_id);
create index if not exists lender_faq_entry_search on public.lender_faq_entry using gin (search_tsv);

alter table public.lender_faq_entry enable row level security;

revoke all on public.lender_faq_entry from anon, authenticated, service_role;
grant select on public.lender_faq_entry to authenticated;
grant insert (id, account_id, deal_id, question, answer, status, pinned) on public.lender_faq_entry to authenticated;
grant update (question, answer, status, pinned, version) on public.lender_faq_entry to authenticated;
grant select, insert, update, delete on public.lender_faq_entry to service_role;

-- updated_at is the lender-facing "updated" date, so only a change to the
-- question or answer moves it. first_published_at, once set, never changes:
-- the digest and the newest-first order both go by it. Only server code
-- publishes, so every publish goes through the action that tells lenders.
create or replace function public.lender_faq_entry_maintain()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if new.status = 'published'
    and (tg_op = 'INSERT' or old.status <> 'published')
    and current_user = 'authenticated' then
    raise exception 'Only server code publishes an FAQ entry'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    new.first_published_at := case when new.status = 'published' then now() end;
  else
    if (new.question, new.answer) is distinct from (old.question, old.answer) then
      if new.version <> old.version then
        raise exception 'FAQ entry % was saved by someone else since version %', old.id, new.version
          using errcode = 'serialization_failure';
      end if;
      new.version := old.version + 1;
      new.updated_at := now();
    else
      new.version := old.version;
    end if;
    new.first_published_at := coalesce(
      old.first_published_at,
      case when new.status = 'published' then now() end
    );
  end if;

  new.search_tsv :=
    setweight(to_tsvector('english', new.question), 'A')
    || setweight(to_tsvector('english', new.answer), 'B');
  return new;
end;
$$;

create trigger lender_faq_entry_maintain
  before insert or update on public.lender_faq_entry
  for each row execute function public.lender_faq_entry_maintain();

create policy lender_faq_entry_read on public.lender_faq_entry
  for select to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

create policy lender_faq_entry_insert on public.lender_faq_entry
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy lender_faq_entry_update on public.lender_faq_entry
  for update to authenticated
  using (public.manages_deal_in_account(deal_id, account_id))
  with check (public.manages_deal_in_account(deal_id, account_id));

-- The asks an entry answers. Several asks may share one entry.
create table if not exists public.lender_faq_source (
  entry_id uuid not null references public.lender_faq_entry (id) on delete cascade,
  ask_id uuid not null references public.lender_ask (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, ask_id)
);

alter table public.lender_faq_source enable row level security;

revoke all on public.lender_faq_source from anon, authenticated, service_role;
grant select, insert on public.lender_faq_source to authenticated;
grant select, insert, update, delete on public.lender_faq_source to service_role;

create policy lender_faq_source_read on public.lender_faq_source
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_faq_entry e
      where e.id = lender_faq_source.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

create policy lender_faq_source_insert on public.lender_faq_source
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.lender_faq_entry e
      join public.lender_ask a on a.id = lender_faq_source.ask_id
      join public.lender_room r on r.id = a.room_id and r.deal_id = e.deal_id
      where e.id = lender_faq_source.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

-- A file of an entry. deal_id rides along so the storage key can be held to
-- the entry's own deal by a plain check. Only server code adds one, after the
-- action has checked where the file came from.
create table if not exists public.lender_faq_file (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  deal_id uuid not null,
  name text not null check (btrim(name) <> ''),
  storage_path text not null,
  source_dr_document_id uuid,
  added_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (entry_id, deal_id) references public.lender_faq_entry (id, deal_id) on delete cascade,
  check (
    starts_with(storage_path, 'deal/' || deal_id || '/')
    and storage_path !~ '\\|(^|/)\.{0,2}(/|$)'
  )
);

create index if not exists lender_faq_file_entry on public.lender_faq_file (entry_id);

alter table public.lender_faq_file enable row level security;

revoke all on public.lender_faq_file from anon, authenticated, service_role;
grant select, delete on public.lender_faq_file to authenticated;
grant update (name) on public.lender_faq_file to authenticated;
grant select, insert, update, delete on public.lender_faq_file to service_role;

create policy lender_faq_file_read on public.lender_faq_file
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_faq_entry e
      where e.id = lender_faq_file.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

create policy lender_faq_file_update on public.lender_faq_file
  for update to authenticated
  using (
    exists (
      select 1 from public.lender_faq_entry e
      where e.id = lender_faq_file.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

create policy lender_faq_file_delete on public.lender_faq_file
  for delete to authenticated
  using (
    exists (
      select 1 from public.lender_faq_entry e
      where e.id = lender_faq_file.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

-- A fresh upload for an entry, from the moment its staging key is issued until
-- it is added as a file. Server code alone writes it, so adding reads back the
-- key it issued rather than trusting one sent by the browser.
create table if not exists public.lender_faq_upload (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  deal_id uuid not null,
  name text not null,
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  registered_at timestamptz,
  foreign key (entry_id, deal_id) references public.lender_faq_entry (id, deal_id) on delete cascade,
  check (
    starts_with(storage_path, 'deal/' || deal_id || '/')
    and storage_path !~ '\\|(^|/)\.{0,2}(/|$)'
  )
);

alter table public.lender_faq_upload enable row level security;

revoke all on public.lender_faq_upload from anon, authenticated, service_role;
grant select on public.lender_faq_upload to authenticated;
grant select, insert, update, delete on public.lender_faq_upload to service_role;

create policy lender_faq_upload_read on public.lender_faq_upload
  for select to authenticated
  using (
    exists (
      select 1 from public.lender_faq_entry e
      where e.id = lender_faq_upload.entry_id
        and public.manages_deal_in_account(e.deal_id, e.account_id)
    )
  );

-- An entry withheld from one room. Both keys carry the deal, so a room and an
-- entry of different deals cannot be paired.
create table if not exists public.lender_faq_hidden (
  room_id uuid not null,
  deal_id uuid not null,
  entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, entry_id),
  foreign key (room_id, deal_id) references public.lender_room (id, deal_id) on delete cascade,
  foreign key (entry_id, deal_id) references public.lender_faq_entry (id, deal_id) on delete cascade
);

alter table public.lender_faq_hidden enable row level security;

revoke all on public.lender_faq_hidden from anon, authenticated, service_role;
grant select, insert, delete on public.lender_faq_hidden to authenticated;
grant select, insert, update, delete on public.lender_faq_hidden to service_role;

create policy lender_faq_hidden_read on public.lender_faq_hidden
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_faq_hidden_insert on public.lender_faq_hidden
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id));

create policy lender_faq_hidden_delete on public.lender_faq_hidden
  for delete to authenticated
  using (public.can_manage_lender_room(room_id));

-- Whether one room shows an entry, regardless of who is asking or whether the
-- room is open.
create or replace function public.lender_room_shows_faq_entry_unchecked(room_id uuid, entry_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1
    from public.lender_faq_entry e
    join public.lender_room r on r.id = lender_room_shows_faq_entry_unchecked.room_id and r.deal_id = e.deal_id
    where e.id = lender_room_shows_faq_entry_unchecked.entry_id
      and e.status = 'published'
      and not exists (
        select 1 from public.lender_faq_hidden h
        where h.room_id = r.id and h.entry_id = e.id
      )
  );
$$;

-- A room's FAQ for its open-room members and its deal team, pinned entries
-- first, then newest. With a query, entries sharing any of its words, most
-- shared first.
create or replace function public.lender_room_faq(room_id uuid, query text default null)
  returns table (
    id uuid,
    question text,
    answer text,
    pinned boolean,
    first_published_at timestamptz,
    updated_at timestamptz,
    files jsonb
  )
  language sql stable security definer
  set search_path = '' as $$
  select
    e.id,
    e.question,
    e.answer,
    e.pinned,
    e.first_published_at,
    e.updated_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
        from public.lender_faq_file f
        where f.entry_id = e.id
      ),
      '[]'::jsonb
    )
  from public.lender_faq_entry e
  cross join (select replace(plainto_tsquery('english', lender_room_faq.query)::text, ' & ', ' | ')::tsquery as q) s
  where (
      public.is_lender_room_member(lender_room_faq.room_id)
      or public.can_manage_lender_room(lender_room_faq.room_id)
    )
    and public.lender_room_shows_faq_entry_unchecked(lender_room_faq.room_id, e.id)
    and (lender_room_faq.query is null or e.search_tsv @@ s.q)
  order by ts_rank(e.search_tsv, s.q) desc nulls last, e.pinned desc, e.first_published_at desc, e.id;
$$;

grant execute on function public.lender_room_faq(uuid, text) to authenticated, service_role;

-- For the deal team, before adding an entry: every entry of the deal, of any
-- status and whichever rooms hide it, sharing a word with the new question,
-- most shared first.
create or replace function public.lender_deal_faq_search(deal_id uuid, query text)
  returns table (id uuid, question text)
  language sql stable security definer
  set search_path = '' as $$
  select e.id, e.question
  from public.lender_faq_entry e
  cross join (select replace(plainto_tsquery('english', lender_deal_faq_search.query)::text, ' & ', ' | ')::tsquery as q) s
  where e.deal_id = lender_deal_faq_search.deal_id
    and public.manages_deal_in_account(e.deal_id, e.account_id)
    and e.search_tsv @@ s.q
  order by ts_rank(e.search_tsv, s.q) desc, e.created_at desc, e.id;
$$;

grant execute on function public.lender_deal_faq_search(uuid, text) to authenticated, service_role;

-- For the FAQ file route: whether the caller may open this file in this room.
create or replace function public.lender_room_shows_faq_file(room_id uuid, file_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select (
      public.is_lender_room_member(lender_room_shows_faq_file.room_id)
      or public.can_manage_lender_room(lender_room_shows_faq_file.room_id)
    )
    and exists (
      select 1 from public.lender_faq_file f
      where f.id = lender_room_shows_faq_file.file_id
        and public.lender_room_shows_faq_entry_unchecked(lender_room_shows_faq_file.room_id, f.entry_id)
    );
$$;

grant execute on function public.lender_room_shows_faq_file(uuid, uuid) to authenticated, service_role;

-- For publish, which has to tell every lender person shown the entry. Service
-- role only, since it answers for every room at once.
create or replace function public.lender_faq_recipients(entry_id uuid)
  returns table (room_id uuid, user_id uuid, email text)
  language sql stable security definer
  set search_path = '' as $$
  select m.room_id, m.user_id, u.email::text
  from public.lender_faq_entry e
  join public.lender_room r on r.deal_id = e.deal_id
  join public.lender_room_member m on m.room_id = r.id
  join auth.users u on u.id = m.user_id
  where e.id = lender_faq_recipients.entry_id
    and public.lender_room_is_open(r)
    and public.lender_room_shows_faq_entry_unchecked(r.id, e.id);
$$;

grant execute on function public.lender_faq_recipients(uuid) to service_role;

-- For the digest at send time: which of these entries the person can still
-- see, and through which room (the lowest room id when several show it).
-- Service role only, since it answers for whichever person is named.
create or replace function public.lender_visible_faq_entries(user_id uuid, entry_ids uuid[])
  returns table (entry_id uuid, question text, room_id uuid, room_name text)
  language sql stable security definer
  set search_path = '' as $$
  select distinct on (e.id) e.id, e.question, r.id, r.name
  from public.lender_faq_entry e
  join public.lender_room r on r.deal_id = e.deal_id
  join public.lender_room_member m on m.room_id = r.id
  where e.id = any (lender_visible_faq_entries.entry_ids)
    and m.user_id = lender_visible_faq_entries.user_id
    and public.lender_room_is_open(r)
    and public.lender_room_shows_faq_entry_unchecked(r.id, e.id)
  order by e.id, r.id;
$$;

grant execute on function public.lender_visible_faq_entries(uuid, uuid[]) to service_role;
