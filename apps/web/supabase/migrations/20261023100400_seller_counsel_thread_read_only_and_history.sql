update storage.buckets set file_size_limit = 314572800 where id = 'seller-counsel-thread';

-- Explicit dispatch. Unknown aggregate_type raises rather than silently
-- dropping the event.
create or replace function public.project_deal_event(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.aggregate_type = 'deal' and ev.event_type = 'deal.financials_adopted' then
    perform public.project_deal_financials(ev);
  elsif ev.aggregate_type = 'deal' and ev.event_type = 'deal.close_deadline_set' then
    perform public.project_deal_close_deadline(ev);
  elsif ev.aggregate_type = 'deal' then
    perform public.project_deal(ev);
  elsif ev.aggregate_type = 'deal_box' then
    perform public.project_deal_box(ev);
  elsif ev.aggregate_type = 'checklist_item' then
    perform public.project_checklist_item(ev);
  elsif ev.aggregate_type = 'approval' then
    perform public.project_approval(ev);
  elsif ev.aggregate_type = 'deal_participant' then
    perform public.project_deal_participant(ev);
  elsif ev.aggregate_type = 'dr_document' then
    perform public.project_dr_document(ev);
  elsif ev.aggregate_type = 'meeting' then
    perform public.project_meeting(ev);
  elsif ev.aggregate_type = 'meeting_action_item' then
    perform public.project_meeting_action_item(ev);
  elsif ev.aggregate_type = 'contract' then
    perform public.project_contract(ev);
  elsif ev.aggregate_type = 'offer' then
    perform public.project_offer(ev);
  elsif ev.aggregate_type = 'deal_milestone' then
    perform public.project_deal_milestone(ev);
  -- History only; delivery state lives on deal_update_recipient.
  elsif ev.aggregate_type = 'deal_update' then
    null;
  -- History only; a workflow trigger reads it from the log.
  elsif ev.aggregate_type = 'lender_room' and ev.event_type = 'lender_room.went_quiet' then
    null;
  -- History only; the email relay reads it from the log.
  elsif ev.aggregate_type = 'seller_counsel_message' then
    null;
  else
    raise exception 'no projector for aggregate_type %', ev.aggregate_type;
  end if;
end;
$$;

-- The deal-level snapshot body: the deal row plus a compact manifest of each
-- child aggregate's current head aggregate_seq (D3), not a full child bundle.
-- The team reads these snapshots, so seller and counsel thread messages stay out.
create or replace function public.deal_wide_manifest(p_deal_id uuid)
  returns jsonb
  language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'deal', (select to_jsonb(d) from public.deal d where d.id = p_deal_id),
    'heads', coalesce((
      select jsonb_object_agg(k, mx)
      from (
        select de.aggregate_type || ':' || de.aggregate_id::text as k, max(de.aggregate_seq) as mx
        from public.deal_event de
        where de.deal_id = p_deal_id
          and de.aggregate_type <> 'seller_counsel_message'
        group by de.aggregate_type, de.aggregate_id
      ) s
    ), '{}'::jsonb)
  );
$$;

-- Both sides keep reading once the room closes or the deal ends; nobody posts.
create or replace function public.seller_counsel_thread_read_only_reason(deal_id uuid)
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select case
    when d.archived_at is not null or d.resolution is not null
      then 'This deal has closed, so this thread is read-only.'
    when r.closed_at is not null
      then 'The seller room is closed, so this thread is read-only.'
  end
  from public.deal d
  join public.seller_room r on r.deal_id = d.id
  where d.id = seller_counsel_thread_read_only_reason.deal_id
    and public.is_deal_seller_side(d.id);
$$;

revoke all on function public.seller_counsel_thread_read_only_reason(uuid) from public, anon;
grant execute on function public.seller_counsel_thread_read_only_reason(uuid) to authenticated, service_role;

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

  if read_only_reason is not null then
    raise exception '%', read_only_reason;
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

revoke all on function public.post_seller_counsel_message(uuid, text, jsonb) from public, anon;
grant execute on function public.post_seller_counsel_message(uuid, text, jsonb) to authenticated, service_role;

-- Each post is recorded in the deal history for the email relay, which the
-- buyer side never read.
create policy deal_event_seller_counsel_thread_kept on public.deal_event
  as restrictive for select to authenticated
  using (aggregate_type <> 'seller_counsel_message');

create policy deal_event_snapshot_seller_counsel_thread_kept on public.deal_event_snapshot
  as restrictive for select to authenticated
  using (aggregate_type <> 'seller_counsel_message');
