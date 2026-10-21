-- A person's own time zone, used to send their digests in their evening, and a
-- team's, used for its schedules and dated waits. Members with settings.manage
-- set a team's through the accounts_update policy.

create or replace function public.is_known_timezone(name text)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names z where z.name = is_known_timezone.name);
$$;

grant execute on function public.is_known_timezone(text) to authenticated, service_role;

alter table public.accounts add column timezone text;

alter table public.accounts add constraint accounts_timezone_known check (
  timezone is null or public.is_known_timezone(timezone)
);

grant update (timezone) on public.accounts to authenticated;

-- A team's time zone starts as its creator's own, else UTC.
create or replace function tuckin.default_team_timezone()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  new.timezone := coalesce(
    (select p.timezone from public.accounts p
     where p.primary_owner_user_id = new.primary_owner_user_id and p.is_personal_account),
    'UTC'
  );
  return new;
end;
$$;

create trigger default_team_timezone
  before insert on public.accounts
  for each row when (not new.is_personal_account and new.timezone is null)
  execute function tuckin.default_team_timezone();
