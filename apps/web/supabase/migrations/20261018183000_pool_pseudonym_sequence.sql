-- Pseudonym numbers come from a sequence rather than a row count, so a number
-- freed by a deleted key is never handed out again. The sequence starts past
-- every number already in use in either pool.
create sequence if not exists public.pool_pseudonym_number;

select setval(
  'public.pool_pseudonym_number',
  coalesce(max((regexp_match(pseudonym, '(\d+)$'))[1]::bigint), 0) + 1,
  false
)
from (
  select pseudonym from public.activity_pool_key
  union all
  select pseudonym from public.comp_pool_key
) as keys;

create or replace function public.next_pool_pseudonym_number()
  returns bigint
  language sql set search_path = '' as $$
  select nextval('public.pool_pseudonym_number');
$$;

revoke all on sequence public.pool_pseudonym_number from public, anon, authenticated;
grant usage on sequence public.pool_pseudonym_number to service_role;
revoke all on function public.next_pool_pseudonym_number() from public, anon, authenticated;
grant execute on function public.next_pool_pseudonym_number() to service_role;
