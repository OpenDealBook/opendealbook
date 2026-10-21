-- Sellers keep reading their room once it closes or the deal ends; writing
-- stops then (see 99w). Seller's counsel read it only while it is open.
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
        or (public.seller_room_is_open(r) and public.is_deal_counsel(r.deal_id, 'seller'))
      )
  );
end;
$$;

grant execute on function public.is_seller_room_member(uuid) to authenticated, service_role;

-- The deals whose room the caller reads: every room they sell in, open or not,
-- and open rooms they are seller's counsel on.
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
      or (public.seller_room_is_open(r) and public.is_deal_counsel(r.deal_id, 'seller'))
  );
end;
$$;

grant execute on function public.seller_room_deal_ids() to authenticated, service_role;

drop policy dr_folder_seller_read on public.dr_folder;
drop policy dr_document_seller_read on public.dr_document;

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

-- The seller side keep reading once the room closes or the deal ends; nobody
-- on it writes. The buyer side get no reason.
create or replace function public.seller_side_read_only_reason(deal_id uuid)
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select case
    when d.archived_at is not null or d.resolution is not null
      then 'This deal has closed, so everything here is read-only.'
    when r.closed_at is not null
      then 'The seller room is closed, so this is read-only.'
  end
  from public.deal d
  join public.seller_room r on r.deal_id = d.id
  where d.id = seller_side_read_only_reason.deal_id
    and public.is_deal_seller_side(d.id);
$$;

revoke all on function public.seller_side_read_only_reason(uuid) from public, anon;
grant execute on function public.seller_side_read_only_reason(uuid) to authenticated, service_role;

drop policy seller_counsel_thread_objects_insert on storage.objects;

create policy seller_counsel_thread_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seller-counsel-thread'
    and public.is_deal_seller_side(((storage.foldername(name))[1])::uuid)
    and public.seller_side_read_only_reason(((storage.foldername(name))[1])::uuid) is null
  );

-- Posting names the author from the side they are on, and attaches only files
-- the author uploaded for this deal.
create or replace function public.post_seller_counsel_message(deal_id uuid, body text, files jsonb default '[]')
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  author_side public.seller_counsel_author_side;
  author_name text;
  read_only_reason text := public.seller_side_read_only_reason(post_seller_counsel_message.deal_id);
  message_id uuid;
begin
  if read_only_reason is not null then
    raise exception '%', read_only_reason;
  end if;

  select 'seller', m.name into author_side, author_name
  from public.seller_room_member m
  join public.seller_room r on r.id = m.room_id
  where r.deal_id = post_seller_counsel_message.deal_id and m.user_id = (select auth.uid());

  if author_side is null and public.is_deal_counsel(post_seller_counsel_message.deal_id, 'seller') then
    select 'counsel', coalesce(c.name, c.email) into author_side, author_name
    from public.deal_counsel c
    where c.deal_id = post_seller_counsel_message.deal_id and c.side = 'seller' and c.user_id = (select auth.uid());
  end if;

  if author_side is null then
    raise exception 'only the seller side post in this thread' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from jsonb_array_elements(files) f
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'seller-counsel-thread'
        and o.name = f ->> 'path'
        and o.owner_id = (select auth.uid())::text
        and (storage.foldername(o.name))[1] = post_seller_counsel_message.deal_id::text
    )
  ) then
    raise exception 'a file can be attached only by the person who uploaded it' using errcode = 'insufficient_privilege';
  end if;

  insert into public.seller_counsel_message (account_id, deal_id, author_user_id, author_side, author_name, body)
  select d.account_id, d.id, (select auth.uid()), author_side, author_name, post_seller_counsel_message.body
  from public.deal d where d.id = post_seller_counsel_message.deal_id
  returning id into message_id;

  insert into public.seller_counsel_message_file (account_id, deal_id, message_id, name, storage_path)
  select d.account_id, d.id, message_id, f ->> 'name', f ->> 'path'
  from public.deal d, jsonb_array_elements(files) f
  where d.id = post_seller_counsel_message.deal_id;

  return message_id;
end;
$$;

drop function public.seller_counsel_thread_read_only_reason(uuid);

create policy seller_room_question_message_seller_read_only on public.seller_room_question_message
  as restrictive for insert to authenticated
  with check (
    side <> 'seller'
    or exists (
      select 1 from public.seller_room_question q
      join public.seller_room r on r.id = q.room_id
      where q.id = seller_room_question_message.question_id
        and public.seller_side_read_only_reason(r.deal_id) is null
    )
  );

create policy seller_room_question_file_seller_read_only on public.seller_room_question_file
  as restrictive for insert to authenticated
  with check (
    side <> 'seller'
    or exists (
      select 1 from public.seller_room_question q
      join public.seller_room r on r.id = q.room_id
      where q.id = seller_room_question_file.question_id
        and public.seller_side_read_only_reason(r.deal_id) is null
    )
  );

create policy deal_counsel_seller_read_only on public.deal_counsel
  as restrictive for delete to authenticated
  using (side <> 'seller' or public.seller_side_read_only_reason(deal_id) is null);
