-- A person's own time zone, used to send their digests in their evening.

create or replace function public.is_known_timezone(name text)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names z where z.name = is_known_timezone.name);
$$;

grant execute on function public.is_known_timezone(text) to authenticated, service_role;

alter table public.accounts add column timezone text;

alter table public.accounts add constraint accounts_personal_timezone check (
  timezone is null or (is_personal_account and public.is_known_timezone(timezone))
);

grant update (timezone) on public.accounts to authenticated;
