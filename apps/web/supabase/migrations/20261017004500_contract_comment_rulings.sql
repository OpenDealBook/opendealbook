-- Only the author's side resolves a comment, and the team is the buyer side.
alter policy contract_comment_resolve on public.contract_comment
  using (author_side = 'buyer' and public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (author_side = 'buyer' and public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create or replace function public.refuse_shared_reply_to_internal()
  returns trigger
  language plpgsql security definer
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

create trigger refuse_shared_reply_to_internal
  before insert or update on public.contract_comment
  for each row execute function public.refuse_shared_reply_to_internal();
