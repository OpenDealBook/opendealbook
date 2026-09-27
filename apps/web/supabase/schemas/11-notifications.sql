-- In-app notifications. A row is either targeted to one user (recipient_user_id
-- set) or an account-wide broadcast (recipient_user_id null, read by every
-- account member). Only the dismissed flag is user-writable.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  recipient_user_id uuid references auth.users (id) on delete cascade,
  type public.notification_type not null default 'info',
  channel public.notification_channel not null default 'in_app',
  body varchar(5000) not null,
  link varchar(255),
  dismissed boolean not null default false,
  expires_at timestamptz default now() + interval '1 month',
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create index ix_notifications_account_active on public.notifications (account_id, dismissed, expires_at);
create index ix_notifications_recipient on public.notifications (recipient_user_id);

revoke all on public.notifications from authenticated, service_role;
grant select on public.notifications to authenticated;
grant update (dismissed) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

create policy notifications_read on public.notifications
  for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and public.has_role_on_account(account_id))
  );

create policy notifications_update on public.notifications
  for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (recipient_user_id is null and public.has_role_on_account(account_id))
  );

-- Only the dismissed flag may change through an authenticated update.
create or replace function tuckin.restrict_notification_update()
  returns trigger
  set search_path = '' as $$
begin
  old.dismissed := new.dismissed;
  if new is distinct from old then
    raise exception 'only the dismissed flag can be updated';
  end if;
  return old;
end;
$$ language plpgsql;

create trigger notifications_restrict_update
  before update on public.notifications
  for each row execute function tuckin.restrict_notification_update();
