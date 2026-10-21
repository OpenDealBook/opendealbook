-- Buyer's counsel and the data room files: what they open, tracked for the
-- team as lender opens are, and what they upload, into one "Buyer's counsel"
-- root folder per deal. Every write is made by server code with the service
-- role, after it has checked the caller.

create type public.counsel_activity_action as enum ('document_previewed', 'document_downloaded');

-- No foreign key on dr_document_id: replay_deal deletes a deal's documents
-- and puts them back under the same ids.
create table if not exists public.counsel_activity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  action public.counsel_activity_action not null,
  dr_document_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_counsel_activity_deal on public.counsel_activity (deal_id);

alter table public.counsel_activity enable row level security;

revoke all on public.counsel_activity from anon, authenticated, service_role;
grant select on public.counsel_activity to authenticated;
grant select, insert, update, delete on public.counsel_activity to service_role;

create policy counsel_activity_read on public.counsel_activity
  for select to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

create table if not exists public.counsel_uploads_folder (
  deal_id uuid primary key references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade
);

alter table public.counsel_uploads_folder enable row level security;

revoke all on public.counsel_uploads_folder from anon, authenticated, service_role;
grant select, insert, update, delete on public.counsel_uploads_folder to service_role;

-- Registering reads the storage key from this row, never from the caller.
create table if not exists public.counsel_upload (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  folder_id uuid not null references public.dr_folder (id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  keep_as_zip boolean,
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  registered_at timestamptz,
  document_ids uuid[]
);

alter table public.counsel_upload enable row level security;

revoke all on public.counsel_upload from anon, authenticated, service_role;
grant select, insert, update, delete on public.counsel_upload to service_role;

-- Two first uploads racing make one folder: the loser drops its own.
create or replace function public.ensure_counsel_uploads_folder(deal_id uuid)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  deal_account uuid;
  folder uuid;
begin
  select u.folder_id into folder
  from public.counsel_uploads_folder u
  where u.deal_id = ensure_counsel_uploads_folder.deal_id;

  if folder is not null then
    return folder;
  end if;

  select d.account_id into strict deal_account
  from public.deal d where d.id = ensure_counsel_uploads_folder.deal_id;

  insert into public.dr_folder (account_id, deal_id, parent_id, name)
  values (deal_account, ensure_counsel_uploads_folder.deal_id, null, 'Buyer''s counsel')
  returning id into folder;

  insert into public.counsel_uploads_folder (deal_id, account_id, folder_id)
  values (ensure_counsel_uploads_folder.deal_id, deal_account, folder)
  on conflict on constraint counsel_uploads_folder_pkey do nothing;

  if not found then
    delete from public.dr_folder where id = folder;
    select u.folder_id into folder
    from public.counsel_uploads_folder u
    where u.deal_id = ensure_counsel_uploads_folder.deal_id;
  end if;

  return folder;
end;
$$;

revoke all on function public.ensure_counsel_uploads_folder(uuid) from public, anon, authenticated;
grant execute on function public.ensure_counsel_uploads_folder(uuid) to service_role;

-- Deleting the deal still takes the folder with it.
create or replace function public.refuse_deleting_counsel_uploads_folder()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (select 1 from public.counsel_uploads_folder u where u.folder_id = old.id)
    and exists (select 1 from public.deal d where d.id = old.deal_id) then
    raise exception 'This folder holds buyer''s counsel uploads and cannot be deleted'
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger counsel_uploads_folder_kept
  before delete on public.dr_folder
  for each row execute function public.refuse_deleting_counsel_uploads_folder();

create or replace function public.refuse_sharing_counsel_folder_to_seller()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    with recursive ancestry as (
      select f.id, f.parent_id from public.dr_folder f where f.id = new.dr_folder_id
      union all
      select p.id, p.parent_id from public.dr_folder p join ancestry a on p.id = a.parent_id
    )
    select 1 from ancestry a
    where a.id in (select u.folder_id from public.counsel_uploads_folder u)
      or a.id in (select s.folder_id from public.seller_counsel_folder s)
  ) then
    raise exception 'Counsel folders cannot be shown to sellers.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger counsel_folder_kept_from_seller
  before insert or update on public.seller_room_folder
  for each row execute function public.refuse_sharing_counsel_folder_to_seller();

create or replace function public.refuse_moving_counsel_folder_to_seller()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    with recursive shared_above as (
      select f.id, f.parent_id from public.dr_folder f where f.id = new.parent_id
      union all
      select p.id, p.parent_id from public.dr_folder p join shared_above a on p.id = a.parent_id
    )
    select 1 from shared_above a
    where a.id in (select sf.dr_folder_id from public.seller_room_folder sf)
      or a.id in (select r.uploads_folder_id from public.seller_room r)
  ) and exists (
    with recursive counsel_above as (
      select f.id, f.parent_id from public.dr_folder f where f.id = old.parent_id
      union all
      select p.id, p.parent_id from public.dr_folder p join counsel_above a on p.id = a.parent_id
    ),
    counsel_below as (
      select new.id as id
      union all
      select c.id from public.dr_folder c join counsel_below b on c.parent_id = b.id
    )
    select 1 from (select id from counsel_above union all select id from counsel_below) t
    where t.id in (select u.folder_id from public.counsel_uploads_folder u)
      or t.id in (select s.folder_id from public.seller_counsel_folder s)
  ) then
    raise exception 'Counsel folders cannot be shown to sellers.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger counsel_folder_kept_from_seller
  before update of parent_id on public.dr_folder
  for each row execute function public.refuse_moving_counsel_folder_to_seller();

create or replace function public.buyer_counsel_seller_question_files(deal_id uuid)
  returns table (question_id uuid, dr_document_id uuid, name text)
  language sql stable security definer
  set search_path = '' as $$
  select f.question_id, f.dr_document_id, d.name
  from public.seller_room_question_file f
  join public.seller_room_question q on q.id = f.question_id
  join public.seller_room r on r.id = q.room_id
  join public.buyer_counsel_documents(buyer_counsel_seller_question_files.deal_id) d on d.id = f.dr_document_id
  where r.deal_id = buyer_counsel_seller_question_files.deal_id
  order by f.created_at;
$$;

revoke all on function public.buyer_counsel_seller_question_files(uuid) from public, anon;
grant execute on function public.buyer_counsel_seller_question_files(uuid) to authenticated, service_role;

-- For server code holding an uploads folder to its folder limit: how many
-- folders sit below it, at any depth. Counted here because a read through the
-- API stops at one page of rows. Service role only.
create or replace function public.dr_folder_count_below(folder_id uuid)
  returns integer
  language sql stable security definer
  set search_path = '' as $$
  with recursive below as (
    select f.id from public.dr_folder f where f.parent_id = dr_folder_count_below.folder_id
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select count(*)::integer from below;
$$;

revoke all on function public.dr_folder_count_below(uuid) from public, anon, authenticated;
grant execute on function public.dr_folder_count_below(uuid) to service_role;

-- ---- Billing lock ----
-- 'members' refuses only the team's own writes. Counsel uploads stop while
-- the team is locked, which the server checks before it writes here.

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('counsel_activity', 'recorded when counsel open files')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.counsel_activity
  for each row execute function tuckin.refuse_team_move();

create trigger same_team_deal_id
  before insert or update on public.counsel_activity
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_deal_id
  before insert or update on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.counsel_uploads_folder
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'folder_id', 'dr_folder');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.counsel_upload
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger same_team_folder_id
  before insert or update on public.counsel_upload
  for each row execute function tuckin.refuse_cross_team_link('deal_id', 'deal', 'folder_id', 'dr_folder');
