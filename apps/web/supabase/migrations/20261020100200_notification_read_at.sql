alter table public.notifications add column read_at timestamptz;

grant update (read_at) on public.notifications to authenticated;

create or replace function tuckin.restrict_notification_update()
  returns trigger
  set search_path = '' as $$
begin
  old.dismissed := new.dismissed;
  old.read_at := new.read_at;
  if new is distinct from old then
    raise exception 'only the dismissed flag and read_at can be updated';
  end if;
  return old;
end;
$$ language plpgsql;
