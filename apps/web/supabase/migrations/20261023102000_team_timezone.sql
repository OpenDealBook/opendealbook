-- Teams get a time zone, set by members with settings.manage through the
-- accounts_update policy like the team's name.
alter table public.accounts drop constraint accounts_personal_timezone;

alter table public.accounts add constraint accounts_timezone_known check (
  timezone is null or public.is_known_timezone(timezone)
);

update public.accounts team
set timezone = coalesce(
  (select p.timezone from public.accounts p
   where p.primary_owner_user_id = team.primary_owner_user_id and p.is_personal_account),
  'UTC'
)
where not team.is_personal_account and team.timezone is null;

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
