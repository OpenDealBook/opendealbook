create or replace view public.screening_entry_current
with (security_invoker = true) as
select entry.*
from public.screening_entry entry
where entry.import_id = (
  select id from public.screening_import
  where status = 'succeeded'
  order by created_at desc
  limit 1
);

revoke all on public.screening_entry_current from anon, authenticated, service_role;
grant select on public.screening_entry_current to service_role;
