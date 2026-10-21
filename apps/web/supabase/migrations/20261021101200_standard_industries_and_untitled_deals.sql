-- Every team starts with a standard list of common small-business industries
-- to pick from; a deal can still name any other industry as free text.
create or replace function public.seed_default_industries(p_account_id uuid)
  returns void
  language sql security definer set search_path = '' as $$
  insert into public.industry (account_id, name)
  select p_account_id, n
  from unnest(array[
    'Accounting & Bookkeeping', 'Auto Repair', 'Childcare', 'Cleaning & Janitorial', 'Construction',
    'Dental', 'Electrical', 'Engineering Services', 'Fitness & Gyms', 'Food Manufacturing',
    'Funeral Services', 'Home Health Care', 'HVAC', 'Insurance Agency', 'IT Services',
    'Landscaping', 'Laundry & Dry Cleaning', 'Legal Services', 'Manufacturing', 'Marketing & Advertising',
    'Medical Practice', 'Pest Control', 'Pet Services', 'Physical Therapy', 'Plumbing',
    'Property Management', 'Restaurants', 'Roofing', 'Staffing', 'Trucking & Logistics',
    'Veterinary', 'Wholesale Distribution'
  ]) as n
  where not exists (
    select 1 from public.industry i
    where i.account_id = p_account_id and lower(i.name) = lower(n)
  );
$$;

revoke all on function public.seed_default_industries(uuid) from public, anon, authenticated, service_role;

create or replace function public.team_gets_default_industries()
  returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_industries(new.id);
  return null;
end;
$$;

create trigger team_default_industries
  after insert on public.accounts
  for each row when (not new.is_personal_account)
  execute function public.team_gets_default_industries();

select public.seed_default_industries(a.id) from public.accounts a where not a.is_personal_account;

-- Brings deals created before these defaults up to them. A deal with no firm
-- is named from its description up to the first colon, semicolon or sentence
-- end, or "Untitled deal" when that leaves nothing. The name is marked
-- unconfirmed, and the deal's deal.created event carries the firm so a replay
-- keeps it. A deal with no folders gets the default folders.
create or replace function public.backfill_deal_defaults()
  returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_deal record;
  v_firm_id uuid;
begin
  for v_deal in
    select d.id, d.account_id,
      coalesce(
        nullif(trim(regexp_replace(d.description, '(?:[:;]|[.!?](?=\s|$))[\s\S]*$', '')), ''),
        'Untitled deal'
      ) as name
    from public.deal d
    where d.firm_id is null
  loop
    insert into public.firm (account_id, name, status, name_confirmed)
    values (v_deal.account_id, v_deal.name, 'deal_created', false)
    returning id into v_firm_id;

    update public.deal set firm_id = v_firm_id where id = v_deal.id;

    update public.deal_event
    set payload = payload || jsonb_build_object('firm_id', v_firm_id)
    where deal_id = v_deal.id and event_type = 'deal.created';
  end loop;

  perform public.add_default_deal_folders(array(
    select d.id from public.deal d
    where not exists (select 1 from public.dr_folder f where f.deal_id = d.id)
  ));
end;
$$;

revoke all on function public.backfill_deal_defaults() from public, anon, authenticated, service_role;

select public.backfill_deal_defaults();
