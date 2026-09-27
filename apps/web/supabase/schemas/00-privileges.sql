-- Baseline privileges for Tuckin.
-- The public schema is locked down: nothing is executable or readable by
-- anon/authenticated unless a later file grants it back explicitly.

create schema if not exists tuckin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

alter default privileges revoke execute on functions from public;

revoke all on schema public from public;
revoke all privileges on database "postgres" from anon;

revoke all privileges on schema public from anon;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all functions in schema public from anon;

alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

grant usage on schema public to authenticated, service_role;
