-- A team may be renamed once per 30 days while the platform limit is monthly.
-- The web app writes config.team_rename_limit from TEAM_RENAME_LIMIT at boot.
-- Super-admins and the service role are exempt.

create type public.team_rename_limit as enum ('monthly', 'off');

alter table public.config add column team_rename_limit public.team_rename_limit not null default 'monthly';

create or replace function public.set_team_rename_limit(rename_limit public.team_rename_limit)
  returns void
  language sql
  set search_path = '' as $$
  update public.config set team_rename_limit = set_team_rename_limit.rename_limit where true;
$$;

revoke all on function public.set_team_rename_limit(public.team_rename_limit) from public, anon, authenticated;
grant execute on function public.set_team_rename_limit(public.team_rename_limit) to service_role;
grant update (team_rename_limit) on public.config to service_role;

alter table public.accounts add column renamed_at timestamptz;

create policy accounts_update on public.accounts
  for update to authenticated
  using (public.has_permission((select auth.uid()), id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), id, 'settings.manage'));

create or replace function public.team_rename_allowed_at(last_renamed_at timestamptz)
  returns timestamptz
  language sql stable security definer
  set search_path = '' as $$
  select last_renamed_at + interval '30 days'
  from public.config
  where team_rename_limit = 'monthly'
    and last_renamed_at + interval '30 days' > now()
    and not public.is_super_admin();
$$;

grant execute on function public.team_rename_allowed_at(timestamptz) to authenticated, service_role;

create or replace function tuckin.limit_team_renames()
  returns trigger
  language plpgsql
  set search_path = '' as $$
declare
  allowed_at timestamptz := public.team_rename_allowed_at(old.renamed_at);
begin
  if allowed_at is not null and current_user <> 'service_role' then
    raise exception 'team was renamed recently'
      using errcode = 'ODB01', detail = to_json(allowed_at) #>> '{}';
  end if;
  new.renamed_at := now();
  return new;
end;
$$;

create trigger accounts_rename_limit
  before update on public.accounts
  for each row when (new.name is distinct from old.name and not new.is_personal_account)
  execute function tuckin.limit_team_renames();
