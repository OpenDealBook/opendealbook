-- Threads stay one level deep. Only new rows are checked, so replies to
-- replies saved before this rule stay as they are.
create or replace function odb.refuse_reply_to_reply()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if exists (
    select 1 from public.contract_comment p
    where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'You can only reply to a top-level comment.';
  end if;
  return new;
end;
$$;

create trigger refuse_reply_to_reply
  before insert on public.contract_comment
  for each row execute function odb.refuse_reply_to_reply();
