-- A single meeting on a deal (Stage 4). A meeting may belong to a recurring
-- series (series_id) or stand alone. Deal-scoped; managed with deals.manage.

create table if not exists public.meeting (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  series_id uuid references public.meeting_series (id) on delete set null,
  type text not null check (type in ('weekly', 'site_visit')),
  scheduled_at timestamptz,
  status text,
  attendees jsonb not null default '[]'::jsonb,
  notes text,
  decisions text,
  recording_url text,
  video_url text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.meeting enable row level security;

create index ix_meeting_deal on public.meeting (deal_id);
create index ix_meeting_account on public.meeting (account_id);
create index ix_meeting_series on public.meeting (series_id);

revoke all on public.meeting from authenticated, service_role;
grant select, insert, update, delete on public.meeting to authenticated;
grant select, insert, update, delete on public.meeting to service_role;

create trigger meeting_timestamps
  before insert or update on public.meeting
  for each row execute function public.set_timestamps();

create trigger meeting_user_tracking
  before insert or update on public.meeting
  for each row execute function public.set_user_tracking();

create policy meeting_read on public.meeting
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy meeting_insert on public.meeting
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_update on public.meeting
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_delete on public.meeting
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
