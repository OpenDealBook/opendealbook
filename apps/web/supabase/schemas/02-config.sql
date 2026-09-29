-- Single-row feature configuration plus the shared timestamp/tracking triggers
-- that most tables reuse.

create table if not exists public.config (
  enable_team_accounts boolean not null default true,
  enable_account_billing boolean not null default true,
  enable_team_account_billing boolean not null default true,
  billing_provider public.billing_provider not null default 'stripe',
  comp_pool_min_bucket int not null default 5
);

alter table public.config enable row level security;

insert into public.config default values;

revoke all on public.config from authenticated, service_role;
grant select on public.config to authenticated, service_role;

create policy config_read on public.config
  for select to authenticated using (true);

create or replace function public.is_set(field_name text)
  returns boolean
  set search_path = '' as $$
declare
  value boolean;
begin
  execute format('select %I from public.config limit 1', field_name) into value;
  return value;
end;
$$ language plpgsql;

grant execute on function public.is_set(text) to authenticated, service_role;

create or replace function public.get_config()
  returns json
  set search_path = '' as $$
  select row_to_json(c) from public.config c limit 1;
$$ language sql;

grant execute on function public.get_config() to authenticated, service_role;

-- Stamp created_at/updated_at on write. created_at is frozen after insert.
create or replace function public.set_timestamps()
  returns trigger
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

-- Stamp created_by/updated_by with the acting user. created_by is frozen after
-- insert.
create or replace function public.set_user_tracking()
  returns trigger
  set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql;
