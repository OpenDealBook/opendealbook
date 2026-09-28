-- Per-recipient notification controls. A row switches one event_type on one
-- channel on or off for one recipient. deal_id null is an account-wide default;
-- deal_id set is a deal-scoped override. Participants and external attorneys
-- manage only their own rows; account admins may read across the account to see
-- who has muted what.

create table if not exists public.notification_preference (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid references public.deal (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  channel public.notification_channel not null,
  event_type text not null,
  enabled boolean not null default true,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid references auth.users default auth.uid(),
  unique (account_id, deal_id, recipient_user_id, channel, event_type)
);

alter table public.notification_preference enable row level security;

create index ix_notification_preference_recipient on public.notification_preference (recipient_user_id);
create index ix_notification_preference_account on public.notification_preference (account_id);

revoke all on public.notification_preference from authenticated, service_role;
grant select, insert, update, delete on public.notification_preference to authenticated;
grant select, insert, update, delete on public.notification_preference to service_role;

create trigger notification_preference_timestamps
  before insert or update on public.notification_preference
  for each row execute function public.set_timestamps();

create policy notification_preference_read on public.notification_preference
  for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or public.has_permission((select auth.uid()), account_id, 'members.manage')
  );

create policy notification_preference_insert on public.notification_preference
  for insert to authenticated
  with check (recipient_user_id = (select auth.uid()));

create policy notification_preference_update on public.notification_preference
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

create policy notification_preference_delete on public.notification_preference
  for delete to authenticated
  using (recipient_user_id = (select auth.uid()));
