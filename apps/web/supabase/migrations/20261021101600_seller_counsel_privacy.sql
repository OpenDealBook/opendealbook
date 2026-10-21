drop policy if exists dr_folder_seller_counsel_kept on public.dr_folder;
drop policy if exists dr_folder_seller_counsel_read on public.dr_folder;
drop policy if exists dr_document_seller_counsel_kept on public.dr_document;
drop policy if exists dr_document_seller_counsel_read on public.dr_document;
drop policy if exists deal_event_seller_counsel_kept on public.deal_event;
drop policy if exists deal_event_snapshot_seller_counsel_kept on public.deal_event_snapshot;
drop policy if exists data_room_objects_seller_counsel_kept on storage.objects;
drop function if exists public.seller_counsel_documents();

create or replace function public.seller_room_comments(room_id uuid)
  returns table (
    id uuid,
    dr_document_id uuid,
    question_id uuid,
    body text,
    author text,
    created_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  select c.id, c.dr_document_id, c.question_id, c.body,
    coalesce(dc.name, dc.email) || ', '
      || coalesce(nullif(split_part(btrim(m.name), ' ', 1), '') || '''s', 'the seller''s') || ' counsel',
    c.created_at
  from public.seller_room_comment c
  join public.seller_room r on r.id = c.room_id
  join public.deal_counsel dc on dc.deal_id = r.deal_id and dc.user_id = c.author_user_id
  left join public.seller_room_member m on m.room_id = r.id and m.user_id = dc.invited_by
  where c.room_id = seller_room_comments.room_id
    and (public.can_manage_seller_room(r.id) or public.is_seller_room_member(r.id))
  order by c.created_at;
$$;

-- Only the seller side read the Seller's counsel folder, everything below it
-- and its files: the seller room's sellers and seller's counsel. The buyer
-- team and buyer's counsel never do; files reach the buyer only when counsel
-- upload them into the seller room.
create or replace function public.is_deal_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_seller_room_member(is_deal_seller_side.deal_id)
    or public.is_deal_counsel(is_deal_seller_side.deal_id, 'seller');
$$;

revoke all on function public.is_deal_seller_side(uuid) from public, anon;
grant execute on function public.is_deal_seller_side(uuid) to authenticated, service_role;

-- The caller's own: only the deals they are on the seller side of.
create or replace function public.seller_counsel_folder_ids()
  returns uuid[]
  language sql stable security definer
  set search_path = '' as $$
  with recursive below as (
    select s.folder_id as id from public.seller_counsel_folder s
    where public.is_deal_seller_side(s.deal_id)
    union all
    select f.id from public.dr_folder f join below b on f.parent_id = b.id
  )
  select coalesce(array_agg(below.id), '{}') from below;
$$;

revoke all on function public.seller_counsel_folder_ids() from public, anon;
grant execute on function public.seller_counsel_folder_ids() to authenticated, service_role;

create or replace function public.is_seller_counsel_folder(folder_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  with recursive above as (
    select f.id, f.parent_id from public.dr_folder f where f.id = is_seller_counsel_folder.folder_id
    union all
    select f.id, f.parent_id from public.dr_folder f join above a on f.id = a.parent_id
  )
  select exists (select 1 from above a join public.seller_counsel_folder s on s.folder_id = a.id);
$$;

revoke all on function public.is_seller_counsel_folder(uuid) from public, anon;
grant execute on function public.is_seller_counsel_folder(uuid) to authenticated, service_role;

create or replace function public.is_seller_counsel_document(document_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.dr_document d
    where d.id = is_seller_counsel_document.document_id and public.is_seller_counsel_folder(d.folder_id)
  );
$$;

revoke all on function public.is_seller_counsel_document(uuid) from public, anon;
grant execute on function public.is_seller_counsel_document(uuid) to authenticated, service_role;

create index if not exists ix_dr_document_storage_path on public.dr_document (storage_path);

create or replace function public.is_seller_counsel_object(name text)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.dr_document d
    where d.storage_path = regexp_replace(is_seller_counsel_object.name, '\.preview\.[a-z]+$', '')
      and public.is_seller_counsel_folder(d.folder_id)
  );
$$;

revoke all on function public.is_seller_counsel_object(text) from public, anon;
grant execute on function public.is_seller_counsel_object(text) to authenticated, service_role;

create policy dr_folder_seller_counsel_kept on public.dr_folder
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_folder(id) or public.is_deal_seller_side(deal_id));

create policy dr_folder_seller_counsel_read on public.dr_folder
  for select to authenticated
  using (id = any ((select public.seller_counsel_folder_ids())::uuid[]));

create policy dr_document_seller_counsel_kept on public.dr_document
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_folder(folder_id) or public.is_deal_seller_side(deal_id));

create policy dr_document_seller_counsel_read on public.dr_document
  for select to authenticated
  using (
    removed_at is null
    and folder_id = any ((select public.seller_counsel_folder_ids())::uuid[])
  );

-- Its files never reach a buyer-side read: not the deal history the team
-- reads, not the stored objects, previews included, and not their indexed
-- text, indexing jobs or verification findings. The seller side open them
-- only through signed links the server makes.
create policy deal_event_seller_counsel_kept on public.deal_event
  as restrictive for select to authenticated
  using (aggregate_type <> 'dr_document' or not public.is_seller_counsel_document(aggregate_id));

create policy deal_event_snapshot_seller_counsel_kept on public.deal_event_snapshot
  as restrictive for select to authenticated
  using (aggregate_type <> 'dr_document' or not public.is_seller_counsel_document(aggregate_id));

create policy data_room_objects_seller_counsel_kept on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'data-room' or not public.is_seller_counsel_object(name));

create policy document_chunk_seller_counsel_kept on public.document_chunk
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_document(document_id));

create policy embedding_job_seller_counsel_kept on public.embedding_job
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_document(dr_document_id));

create policy verification_finding_seller_counsel_kept on public.verification_finding
  as restrictive for select to authenticated
  using (not public.is_seller_counsel_document(dr_document_id));
