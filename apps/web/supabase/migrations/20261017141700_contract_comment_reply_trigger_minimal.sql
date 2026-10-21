create or replace function public.refuse_shared_reply_to_internal()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if not new.internal and exists (
    select 1 from public.contract_comment p
    where p.id = new.parent_id and p.internal
  ) then
    raise exception 'A reply to an internal comment is internal';
  end if;
  return new;
end;
$$;

drop trigger refuse_shared_reply_to_internal on public.contract_comment;

create trigger refuse_shared_reply_to_internal
  before insert on public.contract_comment
  for each row execute function public.refuse_shared_reply_to_internal();
