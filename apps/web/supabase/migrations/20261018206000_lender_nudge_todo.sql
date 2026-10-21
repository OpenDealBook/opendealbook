-- One to-do per lender room and teammate, made by the daily nudge job to point
-- the teammate at a room that is due a nudge, and cleared by the sync job once
-- the room no longer is. Service role only.
create table if not exists public.lender_nudge_todo (
  room_id uuid not null references public.lender_room (id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  todo_id uuid not null references public.personal_todo (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.lender_nudge_todo enable row level security;

revoke all on public.lender_nudge_todo from anon, authenticated, service_role;
grant select, insert, delete on public.lender_nudge_todo to service_role;

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('lender_nudge_todo', 'service-role only, links a teammate''s nudge to-do to a room')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.lender_nudge_todo
  for each row execute function tuckin.refuse_team_move();
