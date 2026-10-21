-- Seller's counsel keep reading for a year from the day the deal ended,
-- archived or resolved, whichever came first. Only they learn the date.
create or replace function public.seller_counsel_read_until(deal_id uuid)
  returns timestamptz
  language sql stable security definer
  set search_path = '' as $$
  select least(
      d.archived_at,
      case when d.resolution is not null then coalesce(
        (select max(e.created_at) from public.deal_event e
         where e.deal_id = d.id and e.event_type = 'deal.resolved'),
        d.updated_at
      ) end
    ) + interval '1 year'
  from public.deal d
  where d.id = seller_counsel_read_until.deal_id
    and exists (
      select 1 from public.deal_counsel c
      where c.deal_id = d.id and c.side = 'seller' and c.user_id = (select auth.uid())
    );
$$;

revoke all on function public.seller_counsel_read_until(uuid) from public, anon;
grant execute on function public.seller_counsel_read_until(uuid) to authenticated, service_role;

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
  )
  and coalesce(now() < public.seller_counsel_read_until(is_deal_seller_counsel_reader.deal_id), true);
$$;

-- Posting names the author from the side they are on, and attaches only files
-- the author uploaded for this deal, each named by its stored object.
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

  if length(body) > 10000 then
    raise exception 'A message can be at most 10,000 characters.';
  end if;

  if jsonb_array_length(files) > 20 then
    raise exception 'Attach at most 20 files to one message.';
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
  select d.account_id, d.id, message_id, regexp_replace(f ->> 'path', '^.*/', ''), f ->> 'path'
  from public.deal d, jsonb_array_elements(files) f
  where d.id = post_seller_counsel_message.deal_id;

  return message_id;
end;
$$;
