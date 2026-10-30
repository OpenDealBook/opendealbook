-- In-app notifications. A row is either targeted to one user (recipient_user_id
-- set) or an account-wide broadcast (recipient_user_id null, read by every
-- account member). Only the dismissed flag is user-writable; read state is
-- per person in notification_reads.
-- dedupe_key lets a relay or a scheduled notice insert the same notice twice
-- and keep one.

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
  created_at timestamptz not null default now(),
  dedupe_key text unique
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

create table if not exists public.notification_reads (
  notification_id bigint not null references public.notifications (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_reads enable row level security;

create index ix_notification_reads_user on public.notification_reads (user_id);

revoke all on public.notification_reads from authenticated, service_role;
grant select, insert on public.notification_reads to authenticated;
grant select, insert, update, delete on public.notification_reads to service_role;

create policy notification_reads_read on public.notification_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_reads_insert on public.notification_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notifications n where n.id = notification_id)
  );

create or replace function public.mark_all_notifications_read(target_account_id uuid)
  returns void
  language sql
  set search_path = '' as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  where n.account_id = target_account_id
  on conflict do nothing;
$$;

revoke execute on function public.mark_all_notifications_read(uuid) from public, anon;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
