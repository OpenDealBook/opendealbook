-- Choosing the primary version is the deal managers' call; deal work edits
-- everything else. The service role is let through.
create or replace function public.refuse_primary_calc_change_without_manage()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if (select auth.uid()) is not null
    and new.is_primary is distinct from (case when tg_op = 'UPDATE' then old.is_primary else false end)
    and not public.has_permission((select auth.uid()), new.account_id, 'deals.manage') then
    raise exception 'choosing the primary calculator needs deals.manage' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger calc_version_primary_needs_manage
  before insert or update of is_primary on public.calc_version
  for each row execute function public.refuse_primary_calc_change_without_manage();
