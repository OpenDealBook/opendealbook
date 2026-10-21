drop function public.team_lender_rooms(uuid);

create function public.team_lender_rooms(account_id uuid)
  returns table (
    room_id uuid,
    deal_id uuid,
    deal_name text,
    deal_description text,
    room_name text,
    status public.lender_room_status,
    expires_at timestamptz,
    closed_at timestamptz,
    is_open boolean,
    brand_domain text,
    brand_name text,
    brand_logo_path text,
    member_count integer,
    requests_waiting_on_team integer,
    last_lender_activity_at timestamptz,
    last_lender_action_at timestamptz
  )
  language sql stable security definer
  set search_path = '' as $$
  with room as (
    select r.*, public.lender_room_is_open(r) as is_open, d.description as deal_description, f.name::text as deal_name
    from public.deal d
    join public.lender_room r on r.deal_id = d.id
    left join public.firm f on f.id = d.firm_id
    where d.account_id = team_lender_rooms.account_id
      and public.has_permission((select auth.uid()), team_lender_rooms.account_id, 'deals.manage')
  ),
  ask as (
    select k.room_id,
      k.status = 'open' and not coalesce(k.return_route = 'esign' and s.status = 'sent', false) as waiting_on_team,
      k.created_at
    from public.lender_ask k
    join room on room.id = k.room_id
    left join lateral (
      select s.status from public.lender_form_signature s
      where s.ask_id = k.id
      order by s.created_at desc
      limit 1
    ) s on true
  ),
  lender_touch as (
    select a.room_id, a.created_at, a.action = 'room_opened' as is_open_only from public.lender_room_activity a
    join room on room.id = a.room_id
    where a.side = 'lender'
    union all
    select ask.room_id, ask.created_at, false from ask
    union all
    select k.room_id, msg.created_at, false from public.lender_ask_message msg
    join public.lender_ask k on k.id = msg.ask_id
    join room on room.id = k.room_id
    where msg.side = 'lender'
    union all
    select u.room_id, u.registered_at, false from public.lender_upload u
    join room on room.id = u.room_id
    where u.registered_at is not null
  )
  select
    room.id, room.deal_id, room.deal_name, room.deal_description, room.name, room.status,
    room.expires_at, room.closed_at, room.is_open, room.brand_domain, b.name, b.logo_path,
    (select count(*)::integer from public.lender_room_member m where m.room_id = room.id),
    (select count(*)::integer from ask where ask.room_id = room.id and ask.waiting_on_team),
    (select max(t.created_at) from lender_touch t where t.room_id = room.id),
    (select max(t.created_at) from lender_touch t where t.room_id = room.id and not t.is_open_only)
  from room
  left join public.lender_brand b on b.domain = room.brand_domain;
$$;

grant execute on function public.team_lender_rooms(uuid) to authenticated, service_role;
