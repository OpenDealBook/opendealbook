-- A recurring meeting cadence for a deal (Stage 4). A meeting_series is the
-- template that individual meeting rows are scheduled from. Deal-scoped;
-- managed with deals.manage.

create table if not exists public.meeting_series (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  weekday int,
  time_of_day time,
  timezone text,
  duration_mins int,
  video_provider text,
  attendees jsonb not null default '[]'::jsonb,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users
);

alter table public.meeting_series enable row level security;

create index ix_meeting_series_deal on public.meeting_series (deal_id);
create index ix_meeting_series_account on public.meeting_series (account_id);

revoke all on public.meeting_series from authenticated, service_role;
grant select, insert, update, delete on public.meeting_series to authenticated;
grant select, insert, update, delete on public.meeting_series to service_role;

create trigger meeting_series_timestamps
  before insert or update on public.meeting_series
  for each row execute function public.set_timestamps();

create trigger meeting_series_user_tracking
  before insert or update on public.meeting_series
  for each row execute function public.set_user_tracking();

create policy meeting_series_read on public.meeting_series
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(deal_id, 'deals.manage')
  );

create policy meeting_series_insert on public.meeting_series
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_series_update on public.meeting_series
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy meeting_series_delete on public.meeting_series
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
