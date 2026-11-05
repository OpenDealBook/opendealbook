-- Takes the team lock before the deal, matching a team delete's lock order.
create or replace function public.insert_activity_pool_key(
  p_pseudonym text,
  p_deal_id uuid,
  p_account_id uuid,
  p_fingerprint text
)
  returns boolean
  language sql set search_path = '' as $$
  with team as (
    select id from public.accounts where id = p_account_id for key share
  ), inserted as (
    insert into public.activity_pool_key (pseudonym, deal_id, account_id, fingerprint)
    select p_pseudonym, p_deal_id, team.id, p_fingerprint from team
    returning 1
  )
  select exists (select 1 from inserted);
$$;

revoke all on function public.insert_activity_pool_key(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.insert_activity_pool_key(text, uuid, uuid, text) to service_role;

-- Takes the team lock before the deal, matching a team delete's lock order.
create or replace function public.insert_comp_pool_key(
  p_pseudonym text,
  p_deal_id uuid,
  p_account_id uuid,
  p_fingerprint text
)
  returns boolean
  language sql set search_path = '' as $$
  with team as (
    select id from public.accounts where id = p_account_id for key share
  ), inserted as (
    insert into public.comp_pool_key (pseudonym, deal_id, account_id, fingerprint)
    select p_pseudonym, p_deal_id, team.id, p_fingerprint from team
    returning 1
  )
  select exists (select 1 from inserted);
$$;

revoke all on function public.insert_comp_pool_key(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.insert_comp_pool_key(text, uuid, uuid, text) to service_role;
