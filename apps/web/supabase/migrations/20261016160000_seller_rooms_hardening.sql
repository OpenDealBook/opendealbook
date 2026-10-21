-- Seller rooms hardening: lender folders never shown, a question file comes
-- from its own room, fixed room columns, the uploads folder kept, and
-- shared meetings that survive a deal replay.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.

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

drop policy if exists seller_room_folder_insert on public.seller_room_folder;
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

drop policy if exists seller_room_question_file_insert on public.seller_room_question_file;
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

revoke update on public.seller_room from authenticated;
grant update (welcome_note, closed_at) on public.seller_room to authenticated;

alter table public.seller_room_meeting drop constraint if exists seller_room_meeting_meeting_id_fkey;

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
