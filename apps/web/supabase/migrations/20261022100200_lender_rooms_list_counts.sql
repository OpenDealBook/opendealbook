-- A lender's rooms list counts what is new and whose turn it is, and comes
-- sorted by what needs attention.

-- The signed-in lender's rooms list, those needing attention first, then the most
-- recently active. New counts the files the room shows and the team's request
-- answers since the lender last opened it, all of them before a first visit,
-- leaving out the lender's own uploads. Your turn counts requests the team
-- answered back to the lender. A closed room counts neither.
create or replace function public.my_lender_room_list()
  returns table (
    room public.lender_room_summary,
    new_count integer,
    your_turn_count integer,
    last_activity_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  with mine as (
    select r.id, r.deal_id, r.created_at, v as summary,
      (
        select max(a.created_at) from public.lender_room_activity a
        where a.room_id = r.id and a.user_id = m.user_id and a.action = 'room_opened'
      ) as last_visit
    from public.lender_room_member m
    join public.lender_room r on r.id = m.room_id
    cross join lateral public.lender_room_view(m.room_id) v
    where m.user_id = (select auth.uid())
  ),
  item as (
    select mine.id as room_id, d.created_at
    from mine
    join public.dr_document d on d.deal_id = mine.deal_id
    where public.lender_room_shows_document_unchecked(mine.id, d.id)
      and not exists (
        select 1 from public.lender_upload u
        where u.room_id = mine.id
          and u.uploaded_by = (select auth.uid())
          and d.id = any(u.document_ids)
      )
    union all
    select k.room_id, msg.created_at
    from mine
    join public.lender_ask k on k.room_id = mine.id
    join public.lender_ask_message msg on msg.ask_id = k.id
    where msg.side = 'internal'
  ),
  counted as (
    select mine.summary,
      case when (mine.summary).is_open then (
        select count(*)::integer from item
        where item.room_id = mine.id
          and (mine.last_visit is null or item.created_at > mine.last_visit)
      ) else 0 end as new_count,
      case when (mine.summary).is_open then (
        select count(*)::integer from public.lender_ask k
        where k.room_id = mine.id and k.status = 'answered'
      ) else 0 end as your_turn_count,
      greatest(mine.created_at, (select max(item.created_at) from item where item.room_id = mine.id)) as last_activity_at
    from mine
  )
  select summary, new_count, your_turn_count, last_activity_at
  from counted
  order by new_count + your_turn_count > 0 desc, last_activity_at desc;
$$;

grant execute on function public.my_lender_room_list() to authenticated, service_role;
