alter table public.paid_lookup add column deal_id uuid references public.deal (id) on delete set null;

create trigger same_team_deal_id
  before insert or update on public.paid_lookup
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

drop function public.reserve_lookup(uuid, uuid, uuid, public.provider_kind, text);

create or replace function public.reserve_lookup(
  p_id uuid,
  p_account_id uuid,
  p_firm_id uuid,
  p_kind public.provider_kind,
  p_provider text,
  p_deal_id uuid default null
)
  returns boolean
  language plpgsql
  set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('lookup_cap:' || p_account_id::text, 0));
  if exists (select 1 from public.paid_lookup where id = p_id and account_id = p_account_id) then
    return true;
  end if;
  if public.lookup_cap_reached(p_account_id) then
    return false;
  end if;
  insert into public.paid_lookup (id, account_id, firm_id, deal_id, kind, provider, cost_cents, outcome, result)
  values (p_id, p_account_id, p_firm_id, p_deal_id, p_kind, p_provider, 0, 'failed', '{}');
  return true;
end;
$$;

revoke all on function public.reserve_lookup(uuid, uuid, uuid, public.provider_kind, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_lookup(uuid, uuid, uuid, public.provider_kind, text, uuid) to service_role;
