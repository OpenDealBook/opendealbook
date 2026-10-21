alter table public.notifications drop column read_at;

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

create table public.notification_reads (
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

alter table public.notifications
  add column deal_id uuid references public.deal (id) on delete set null;

create index ix_notifications_deal on public.notifications (deal_id);

create or replace function tuckin.notify_on_deal_stage_move()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if coalesce(current_setting('odb.replay', true), 'off') = 'on' then
    return new;
  end if;

  insert into public.notifications (account_id, recipient_user_id, deal_id, type, body)
  select distinct new.account_id, dp.user_id, new.id, 'info'::public.notification_type, 'Deal moved to ' || new.stage
  from public.deal_participant dp
  where dp.deal_id = new.id
    and dp.user_id is distinct from auth.uid();

  return new;
end;
$$;
