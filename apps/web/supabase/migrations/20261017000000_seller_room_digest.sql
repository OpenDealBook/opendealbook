-- Who hears about a new file in a seller room, and what a seller digest may name.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.

create or replace function public.seller_room_shows_folder_unchecked_uploads_only(room_id uuid, folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  with recursive ancestry as (
    select f.id, f.parent_id from public.dr_folder f where f.id = seller_room_shows_folder_unchecked_uploads_only.folder_id
    union all
    select p.id, p.parent_id from public.dr_folder p join ancestry a on p.id = a.parent_id
  )
  select exists (
    select 1 from ancestry a
    join public.seller_room r on r.uploads_folder_id = a.id
    where r.id = seller_room_shows_folder_unchecked_uploads_only.room_id
  );
$$;

revoke all on function public.seller_room_shows_folder_unchecked_uploads_only(uuid, uuid) from public, anon, authenticated;
grant execute on function public.seller_room_shows_folder_unchecked_uploads_only(uuid, uuid) to service_role;

-- Sellers of open rooms that show a document through a folder the team picked
-- (not the shared uploads, which sellers fill themselves). Service role only.
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
    and not public.seller_room_shows_folder_unchecked_uploads_only(r.id, d.folder_id);
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
  returns table (kind text, item_id uuid, name text, scheduled_at timestamptz, room_id uuid, team_name text)
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
  select 'document', d.id, d.name, null::timestamptz, r.id, r.team_name
  from public.dr_document d
  join rooms r on r.deal_id = d.deal_id
  where d.id = any (seller_digest_items.document_ids)
    and d.removed_at is null
    and public.seller_room_shows_folder_unchecked(r.id, d.folder_id)
  union all
  select 'folder', f.id, f.name, null, r.id, r.team_name
  from public.seller_room_folder sf
  join rooms r on r.id = sf.room_id
  join public.dr_folder f on f.id = sf.dr_folder_id
  where sf.dr_folder_id = any (seller_digest_items.folder_ids)
    and not public.is_lender_folder(f.id)
  union all
  select 'meeting', mt.id, mt.type, mt.scheduled_at, r.id, r.team_name
  from public.seller_room_meeting sm
  join rooms r on r.id = sm.room_id
  join public.meeting mt on mt.id = sm.meeting_id
  where sm.meeting_id = any (seller_digest_items.meeting_ids);
$$;

revoke all on function public.seller_digest_items(uuid, uuid[], uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.seller_digest_items(uuid, uuid[], uuid[], uuid[]) to service_role;
