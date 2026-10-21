create or replace function public.room_close_ready(room_kind text, room_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  with links as (
    select l.todo_id, l.created_at
    from public.room_closing_todo l
    where l.room_kind = room_close_ready.room_kind and l.room_id = room_close_ready.room_id
  ),
  room as (
    select r.deal_id from public.seller_room r
    where room_close_ready.room_kind = 'seller' and r.id = room_close_ready.room_id
    union all
    select r.deal_id from public.lender_room r
    where room_close_ready.room_kind = 'lender' and r.id = room_close_ready.room_id
  )
  select exists (
    select 1 from links join public.personal_todo t on t.id = links.todo_id where t.done
  )
  or exists (
    select 1
    from public.deal_update u
    join public.deal_update_recipient r on r.update_id = u.id
    cross join lateral unnest(r.entries) e
    where u.deal_id = (select deal_id from room)
      and r.sent_at > (select min(created_at) from links)
      and case room_close_ready.room_kind
        when 'seller' then e.source = 'seller_room'
          or (e.source = 'contact' and e.side = 'seller' and e.role = 'principal')
          or (e.side = 'seller' and e.role = 'broker')
        else e.lender_room_id = room_close_ready.room_id
      end
  );
$$;

create or replace function tuckin.refuse_unready_room_close()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if current_setting('role') = 'authenticated'
    and old.closed_at is null and new.closed_at is not null
    and not public.room_close_ready(tg_argv[0], new.id) then
    raise exception '%', tg_argv[1];
  end if;
  return new;
end;
$$;

create trigger refuse_unready_close
  before update of closed_at on public.seller_room
  for each row execute function tuckin.refuse_unready_room_close(
    'seller', 'Tell the sellers or brokers the room is closing first');

create trigger refuse_unready_close
  before update of closed_at on public.lender_room
  for each row execute function tuckin.refuse_unready_room_close(
    'lender', 'Tell the lender the room is closing first');
