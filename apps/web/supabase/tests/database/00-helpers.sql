-- pgTAP test helpers for Tuckin. Defined outside any transaction so they
-- autocommit and remain available to every *.test.sql file that follows.

create schema if not exists tests;

grant usage on schema tests to anon, authenticated, service_role;

-- Create an auth user tagged with a memorable identifier. The
-- on_auth_user_created trigger provisions their personal account.
create or replace function tests.create_user(identifier text, email text default null)
  returns uuid
  security definer
  set search_path = auth, pg_temp as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (
    new_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    coalesce(email, identifier || '@tuckin.test'),
    jsonb_build_object('test_identifier', identifier, 'name', identifier),
    '{}'::jsonb,
    now(),
    now()
  );
  return new_id;
end;
$$ language plpgsql;

create or replace function tests.get_uid(identifier text)
  returns uuid
  security definer
  set search_path = auth, pg_temp as $$
  select id from auth.users where raw_user_meta_data ->> 'test_identifier' = identifier limit 1;
$$ language sql;

create or replace function tests.account_id(slug text)
  returns uuid
  security definer
  set search_path = '' as $$
  select id from public.accounts where accounts.slug = account_id.slug limit 1;
$$ language sql;

create or replace function tests.login_as(identifier text)
  returns void as $$
declare
  uid uuid := tests.get_uid(identifier);
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$ language plpgsql;

create or replace function tests.login_as_service_role()
  returns void as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$ language plpgsql;

create or replace function tests.logout()
  returns void as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$ language plpgsql;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Self-check so pg_prove sees a valid plan for this bootstrap file.
begin;
select plan(1);
select has_function('tests', 'login_as', 'test helpers are installed');
select * from finish();
rollback;
