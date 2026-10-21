-- Every outreach email sent to a lender room, kept as sent. Internal only and
-- append-only: lenders read nothing here and no one edits or deletes a row.
create table if not exists public.lender_room_outreach (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  account_id uuid not null,
  sent_by uuid references auth.users default auth.uid(),
  sent_at timestamptz not null default now(),
  to_email text not null,
  subject text not null,
  body text not null,
  foreign key (room_id, account_id) references public.lender_room (id, account_id) on delete cascade
);

create index if not exists ix_lender_room_outreach_room on public.lender_room_outreach (room_id, sent_at);

alter table public.lender_room_outreach enable row level security;

revoke all on public.lender_room_outreach from anon, authenticated, service_role;
grant select, insert on public.lender_room_outreach to authenticated;
grant select, insert on public.lender_room_outreach to service_role;

create policy lender_room_outreach_read on public.lender_room_outreach
  for select to authenticated
  using (public.can_manage_lender_room(room_id));

create policy lender_room_outreach_insert on public.lender_room_outreach
  for insert to authenticated
  with check (public.can_manage_lender_room(room_id));

create trigger refuse_write_when_team_locked
  before insert on public.lender_room_outreach
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'room_id', 'lender_room');
