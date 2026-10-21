create or replace function public.create_deal_update(deal_id uuid, subject text, body text, picks jsonb)
  returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  made_id uuid;
begin
  insert into public.deal_update (account_id, deal_id, author_id, subject, body, picks)
  select d.account_id, d.id, (select auth.uid()), create_deal_update.subject, create_deal_update.body,
    create_deal_update.picks
  from public.deal d
  where d.id = create_deal_update.deal_id and public.has_deal_permission(d.id, 'deals.work')
  returning id into made_id;
  if made_id is null then
    raise exception 'not allowed to manage this deal' using errcode = 'insufficient_privilege';
  end if;
  return made_id;
end;
$$;

create or replace function public.authored_deal_update(update_id uuid)
  returns public.deal_update
  language plpgsql security definer
  set search_path = '' as $$
declare
  the_update public.deal_update;
begin
  select * into strict the_update from public.deal_update u where u.id = update_id for update;
  if the_update.author_id is distinct from (select auth.uid())
    or not public.has_deal_permission(the_update.deal_id, 'deals.work') then
    raise exception 'not allowed to change this update' using errcode = 'insufficient_privilege';
  end if;
  return the_update;
end;
$$;
