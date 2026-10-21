-- Before a team closes a seller or lender room it must tell the people in it.
-- Each teammate who starts a close gets one to-do; ticking any of them, or an
-- update sent to the room's people after the first to-do, lets the room close.
-- A completed close forgets the to-dos, so the next close starts fresh.

create table if not exists public.room_closing_todo (
  room_kind text not null check (room_kind in ('seller', 'lender')),
  room_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,
  todo_id uuid not null references public.personal_todo (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_kind, room_id, user_id)
);

alter table public.room_closing_todo enable row level security;

revoke all on public.room_closing_todo from anon, authenticated, service_role;
grant select, insert, delete on public.room_closing_todo to service_role;

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('room_closing_todo', 'service-role only, links a teammate''s closing to-do to a room')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.room_closing_todo
  for each row execute function tuckin.refuse_team_move();

-- The seller rule mirrors the Sellers and Brokers recipient groups in
-- packages/features/deal-updates/src/groups.ts.
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
          or e.role = 'broker'
        else e.lender_room_id = room_close_ready.room_id
      end
  );
$$;

revoke all on function public.room_close_ready(text, uuid) from public, anon, authenticated;
grant execute on function public.room_close_ready(text, uuid) to service_role;
