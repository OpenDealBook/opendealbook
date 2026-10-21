-- The service role may rename a team within the 30 days, and settings managers
-- who are not the owner may change the team picture and public profile.
-- Compiled from tuckin.limit_team_renames in
-- supabase/schemas/99b-team-rename-limit.sql and tuckin.guard_account_identity
-- in supabase/schemas/04-accounts.sql; edit those files, not this one.

create or replace function tuckin.guard_account_identity()
  returns trigger
  set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
      or new.is_personal_account is distinct from old.is_personal_account
      or new.primary_owner_user_id is distinct from old.primary_owner_user_id
      or new.email is distinct from old.email then
      raise exception 'account identity fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

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
