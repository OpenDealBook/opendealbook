-- A new team gets its example deals once, on its first home visit, and its
-- owner's trial emails once the drip workflow has started. Each marker keeps
-- the step from repeating.

alter table public.accounts add column if not exists sample_deals_seeded_at timestamptz;
alter table public.accounts add column if not exists trial_drip_started_at timestamptz;

-- Teams that existed before the markers already had their examples and their
-- trial emails started at sign-up.
update public.accounts
  set sample_deals_seeded_at = coalesce(created_at, now()),
      trial_drip_started_at = coalesce(created_at, now())
  where not is_personal_account and sample_deals_seeded_at is null and trial_drip_started_at is null;

-- Seeds every example row in one transaction, once per team unless reloaded.
-- The sample document's file is stored by the caller after commit, at the
-- returned storage path.
create or replace function public.seed_sample_deals(p_account_id uuid, p_user_id uuid, p_only_once boolean)
  returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_tag constant text := '[Example]';
  v_seeded_at timestamptz;
  v_firms uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_deals uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_contract_id uuid := gen_random_uuid();
  v_document_id uuid := gen_random_uuid();
  v_first_item uuid;
  v_item record;
  v_folder_id uuid;
  v_document_name constant text := v_tag || ' Trailing 12-month P&L.pdf';
  v_storage_path text;
  v_removed_paths jsonb;
begin
  select a.sample_deals_seeded_at into v_seeded_at
  from public.accounts a where a.id = p_account_id for update;

  if p_only_once and (v_seeded_at is not null or exists (
    select 1 from public.firm f where f.account_id = p_account_id and f.name like v_tag || '%'
  )) then
    return null;
  end if;

  -- A reload replaces the examples. Deleting a deal deletes its events with
  -- it, so a replay never rebuilds an example that was removed; the caller
  -- removes the returned files from storage after commit.
  select coalesce(jsonb_agg(doc.storage_path), '[]'::jsonb) into v_removed_paths
  from public.dr_document doc
  join public.deal d on d.id = doc.deal_id
  join public.firm f on f.id = d.firm_id
  where d.account_id = p_account_id and d.capture_method = 'example' and f.name like v_tag || '%';

  delete from public.deal d
  using public.firm f
  where d.account_id = p_account_id and d.capture_method = 'example'
    and f.id = d.firm_id and f.name like v_tag || '%';
  delete from public.firm f
  where f.account_id = p_account_id and f.name like v_tag || '%'
    and not exists (select 1 from public.deal d where d.firm_id = f.id);

  insert into public.firm (id, account_id, name, industry, city, state, employee_band, established_year,
    icp_score, owner_names, status, created_by)
  values
    (v_firms[1], p_account_id, v_tag || ' Coastal HVAC Services', 'Home Services', 'Tampa', 'FL', '25-50', 2004, 84,
      array['Dana Ruiz'], 'deal_created', p_user_id),
    (v_firms[2], p_account_id, v_tag || ' Summit Dental Group', 'Healthcare', 'Denver', 'CO', '10-25', 2011, 76,
      array['Priya Nair'], 'deal_created', p_user_id),
    (v_firms[3], p_account_id, v_tag || ' Riverline Logistics', 'Transportation', 'Columbus', 'OH', '50-100', 1998, 69,
      array['Marcus Bell'], 'deal_created', p_user_id),
    (v_firms[4], p_account_id, v_tag || ' Brightwave Marketing', 'Professional Services', 'Austin', 'TX', '10-25', 2015, 62,
      array['Elena Fischer'], 'deal_created', p_user_id);

  perform public.append_deal_event(d.deal_id, 'deal', d.deal_id, 'deal.created',
    jsonb_build_object(
      'account_id', p_account_id, 'firm_id', d.firm_id, 'industry', d.industry, 'owner_user_id', p_user_id,
      'description', v_tag || ' ' || d.description, 'capture_method', 'example', 'source', d.source,
      'stage', d.stage, 'revenue_ttm', d.revenue_ttm, 'ebitda_ttm', d.ebitda_ttm, 'asking_price', d.asking_price),
    null, 'service')
  from (values
    (v_deals[1], v_firms[1], 'Home Services', 'Sample sourced deal for onboarding', 'marketplace', 'sourcing', 4200000, 780000, 3100000),
    (v_deals[2], v_firms[2], 'Healthcare', 'Sample deal under letter of intent', 'referral', 'loi_submitted', 2600000, 640000, 2900000),
    (v_deals[3], v_firms[3], 'Transportation', 'Sample deal in diligence', 'outreach', 'due_diligence', 9800000, 1450000, 7200000),
    (v_deals[4], v_firms[4], 'Professional Services', 'Sample closed-won deal', 'manual', 'integration', 1800000, 410000, 1650000)
  ) as d(deal_id, firm_id, industry, description, source, stage, revenue_ttm, ebitda_ttm, asking_price);

  perform public.append_deal_event(v_deals[2], 'contract', v_contract_id, 'contract.created',
    '{"type":"loi","status":"draft","current_version":1}'::jsonb, null, 'service');

  for v_item in
    select gen_random_uuid() as id, s.* from (values
      ('Trailing 12-month P&L', 'Financials', 1, true, 'reviewed'),
      ('Federal tax returns (3 years)', 'Financials', 2, false, 'received'),
      ('Corporate formation documents', 'Legal', 1, true, 'requested'),
      ('Material customer contracts', 'Legal', 3, false, 'not_started'),
      ('Customer concentration analysis', 'Operations', 2, false, 'requested'),
      ('Employee roster and org chart', 'Operations', 3, false, 'not_started'),
      ('Facility lease agreement', 'Real Estate', 3, false, 'not_started')
    ) as s(title, category, priority, deal_killer, status)
  loop
    v_first_item := coalesce(v_first_item, v_item.id);
    perform public.append_deal_event(v_deals[3], 'checklist_item', v_item.id, 'checklist_item.added',
      jsonb_build_object('title', v_tag || ' ' || v_item.title, 'category', v_item.category,
        'priority', v_item.priority, 'deal_killer', v_item.deal_killer, 'status', v_item.status),
      null, 'service');
  end loop;

  perform public.append_deal_event(v_deals[3], 'checklist_item', v_first_item, 'checklist_item.status_changed',
    '{"status":"reviewed","outcome":"accepted"}'::jsonb, null, 'service');

  perform public.append_deal_event(v_deals[4], 'deal_milestone', gen_random_uuid(), 'deal_milestone.set',
    '{"kind":"closing","target_on":null,"actual_on":"2026-06-30"}'::jsonb, null, 'service');

  insert into public.contract_version (account_id, contract_id, version, party, source, is_signed, change_summary, author_user_id)
  values (p_account_id, v_contract_id, 1, 'buyer', 'generated', false, v_tag || ' Initial letter of intent draft', p_user_id);

  insert into public.generated_document (account_id, deal_id, contract_id, created_by, values_json)
  values (p_account_id, v_deals[2], v_contract_id, p_user_id, jsonb_build_object('note', v_tag || ' Letter of intent'));

  select f.id into strict v_folder_id
  from public.dr_folder f where f.deal_id = v_deals[3] and f.name = 'Financials';

  v_storage_path := 'deal/' || v_deals[3] || '/' || gen_random_uuid() || '-trailing-12-month-pl.pdf';

  perform public.append_deal_event(v_deals[3], 'dr_document', v_document_id, 'dr_document.added',
    jsonb_build_object('folder_id', v_folder_id, 'name', v_document_name, 'storage_path', v_storage_path),
    null, 'service');

  insert into public.buyer_profile (account_id, version, display_name, headline, about, target_statement, created_by)
  select p_account_id, 1, v_tag || ' Evergreen Holdings',
    v_tag || ' Acquiring durable home-services businesses',
    v_tag || ' A sample buyer profile so you can see how yours will look to sellers and brokers.',
    v_tag || ' Owner-operated firms with $1M-$3M EBITDA in the Southeast US.',
    p_user_id
  where not exists (select 1 from public.buyer_profile b where b.account_id = p_account_id);

  update public.accounts set sample_deals_seeded_at = now() where id = p_account_id;

  return jsonb_build_object('deal_id', v_deals[3], 'document_id', v_document_id, 'storage_path', v_storage_path,
    'removed_paths', v_removed_paths);
end;
$$;

revoke all on function public.seed_sample_deals(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.seed_sample_deals(uuid, uuid, boolean) to service_role;
