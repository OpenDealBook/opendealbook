create or replace function public.apa_stage_gated(account_id uuid, stage text)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select apa_stage_gated.stage = any (array['pa_accepted', 'announcement', 'integration'])
    and exists (
      select 1 from public.pipeline_stage s
      where s.account_id = apa_stage_gated.account_id and s.key = 'pa_accepted'
    );
$$;

revoke all on function public.apa_stage_gated(uuid, text) from public, anon, authenticated;

create or replace function public.refuse_apa_stage_without_counsel()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if public.apa_stage_gated(new.account_id, new.stage)
    and not public.apa_stage_gated(old.account_id, old.stage)
    and not public.apa_counsel_ready(new.id)
    and not exists (
      select 1 from public.contract c
      join public.contract_version v on v.contract_id = c.id
      where c.deal_id = new.id and c.type = 'apa' and v.is_signed
    ) then
    raise exception 'An APA needs buyer''s counsel and seller''s counsel on the deal';
  end if;
  return new;
end;
$$;

create or replace function public.refuse_late_deal_creation()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if (select auth.uid()) is not null and public.apa_stage_gated(new.account_id, new.stage) then
    raise exception 'A new deal cannot start at PA Accepted or a later stage';
  end if;
  return new;
end;
$$;

create trigger refuse_late_deal_creation
  before insert on public.deal
  for each row execute function public.refuse_late_deal_creation();
