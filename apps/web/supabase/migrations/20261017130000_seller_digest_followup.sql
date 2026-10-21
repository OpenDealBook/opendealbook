-- Seller digest follow-up: a seller's own upload is never announced, the team's
-- uploads are; digest items carry the file's folder; a record of what sellers
-- were told about.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.

drop function if exists public.seller_digest_items(uuid, uuid[], uuid[], uuid[]);

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

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('seller_room_announcement', 'service-role only, records what sellers were told')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.seller_room_announcement
  for each row execute function tuckin.refuse_team_move();

drop function if exists public.seller_room_shows_folder_unchecked_uploads_only(uuid, uuid);
