-- Seller's counsel keep reading once the deal has ended, as the seller does;
-- is_deal_counsel still ends everything they can change.
create or replace function public.is_deal_seller_counsel_reader(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.deal_counsel c
    where c.deal_id = is_deal_seller_counsel_reader.deal_id
      and c.side = 'seller'
      and c.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_deal_seller_counsel_reader(uuid) from public, anon;
grant execute on function public.is_deal_seller_counsel_reader(uuid) to authenticated, service_role;

create or replace function public.is_deal_seller_side(deal_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select public.is_deal_seller_room_member(is_deal_seller_side.deal_id)
    or public.is_deal_seller_counsel_reader(is_deal_seller_side.deal_id);
$$;

drop policy seller_counsel_thread_objects_insert on storage.objects;

create policy seller_counsel_thread_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'seller-counsel-thread'
    and public.is_deal_seller_side(((storage.foldername(name))[1])::uuid)
    and public.seller_counsel_thread_read_only_reason(((storage.foldername(name))[1])::uuid) is null
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
  read_only_reason text := public.seller_counsel_thread_read_only_reason(post_seller_counsel_message.deal_id);
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
