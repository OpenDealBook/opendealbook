create or replace function public.refuse_apa_stage_without_counsel()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  gate int;
begin
  select sort_order into gate from public.pipeline_stage
  where account_id = new.account_id and key = 'pa_accepted';

  if (select sort_order from public.pipeline_stage
      where account_id = new.account_id and key = new.stage) >= gate
    and (select sort_order from public.pipeline_stage
      where account_id = old.account_id and key = old.stage) < gate
    and not public.apa_counsel_ready(new.id) then
    raise exception 'An APA needs buyer''s counsel and seller''s counsel on the deal';
  end if;
  return new;
end;
$$;

drop trigger refuse_apa_stage_without_counsel on public.deal;

create trigger refuse_apa_stage_without_counsel
  before update of stage on public.deal
  for each row
  when (new.stage is distinct from old.stage)
  execute function public.refuse_apa_stage_without_counsel();
