create or replace function public.refuse_apa_stage_without_counsel()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not public.apa_counsel_ready(new.id) then
    raise exception 'An APA needs buyer''s counsel and seller''s counsel on the deal';
  end if;
  return new;
end;
$$;

create trigger refuse_apa_stage_without_counsel
  before update of stage on public.deal
  for each row
  when (new.stage = 'pa_accepted' and old.stage is distinct from 'pa_accepted')
  execute function public.refuse_apa_stage_without_counsel();
