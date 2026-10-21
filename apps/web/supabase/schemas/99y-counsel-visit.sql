-- When outside counsel last opened each tracked area of a deal, so the deal
-- Overview shows only what is new to them since.

create table if not exists public.counsel_visit (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  area text not null check (area in ('messages', 'seller_room')),
  visited_at timestamptz not null default now(),
  primary key (user_id, deal_id, area)
);

alter table public.counsel_visit enable row level security;

revoke all on public.counsel_visit from anon, authenticated, service_role;
grant select, insert, update on public.counsel_visit to authenticated;
grant select, insert, update, delete on public.counsel_visit to service_role;

create policy counsel_visit_read on public.counsel_visit
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy counsel_visit_insert on public.counsel_visit
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy counsel_visit_update on public.counsel_visit
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into tuckin.billing_lock_exempt_tables (table_name, reason) values
  ('counsel_visit', 'outside counsel''s own marker of when they last opened part of a deal')
on conflict (table_name) do update set reason = excluded.reason;

create trigger refuse_team_move
  before update on public.counsel_visit
  for each row execute function tuckin.refuse_team_move();
