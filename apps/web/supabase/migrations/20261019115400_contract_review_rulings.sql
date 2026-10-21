-- Counsel sign-off rulings: a side may change its decision on a version and
-- the latest counts; the whole team reads review rows; counsel read requests;
-- an override needs a non-blank reason; only the deal's team and counsel ask
-- whether a version is ready; team default changes are logged; requests,
-- decisions, overrides and deal gate changes go on the deal's log.
-- Compiled from supabase/schemas/99u-contract-review.sql and
-- supabase/schemas/65-deal-event-projectors.sql; edit those, not this one.

alter table public.contract_review_decision drop constraint contract_review_decision_contract_version_id_side_key;
alter table public.contract_review_decision alter column decided_at set default clock_timestamp();
create index if not exists ix_contract_review_decision_version on public.contract_review_decision (contract_version_id, side, decided_at);

alter table public.contract_signing_override
  add constraint contract_signing_override_reason_check check (btrim(reason) <> '');

drop table public.contract_review_gate_default;

create table if not exists public.contract_review_gate_default_change (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_type text not null check (contract_type in ('loi', 'apa')),
  was_required boolean not null,
  required boolean not null,
  changed_by uuid not null default auth.uid() references auth.users on delete cascade,
  changed_at timestamptz not null default clock_timestamp()
);

create index if not exists ix_contract_review_gate_default_change_account
  on public.contract_review_gate_default_change (account_id, contract_type, changed_at);

alter table public.contract_review_gate_default_change enable row level security;
revoke all on public.contract_review_gate_default_change from anon, authenticated, service_role;
grant select, insert (account_id, contract_type, required) on public.contract_review_gate_default_change to authenticated;
grant select, insert, update, delete on public.contract_review_gate_default_change to service_role;

create or replace function public.contract_review_team_required(account_id uuid, contract_type text)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select coalesce(
    (
      select t.required from public.contract_review_gate_default_change t
      where t.account_id = contract_review_team_required.account_id
        and t.contract_type = contract_review_team_required.contract_type
      order by t.changed_at desc
      limit 1
    ),
    contract_review_team_required.contract_type = 'apa'
  );
$$;

revoke all on function public.contract_review_team_required(uuid, text) from public, anon;
grant execute on function public.contract_review_team_required(uuid, text) to authenticated, service_role;

create or replace function public.contract_review_required(deal_id uuid, contract_type text)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select coalesce(
    (
      select g.required from public.deal_contract_review_gate_change g
      where g.deal_id = contract_review_required.deal_id and g.contract_type = contract_review_required.contract_type
      order by g.changed_at desc
      limit 1
    ),
    (
      select public.contract_review_team_required(d.account_id, contract_review_required.contract_type)
      from public.deal d
      where d.id = contract_review_required.deal_id
    )
  );
$$;

create or replace function public.contract_version_signing_ready(contract_version_id uuid)
  returns boolean
  language plpgsql stable security definer
  set search_path = '' as $$
declare
  v_contract public.contract;
begin
  select c.* into v_contract
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where v.id = contract_version_signing_ready.contract_version_id;

  if auth.uid() is not null
    and not public.has_role_on_account(v_contract.account_id)
    and not public.is_deal_counsel(v_contract.deal_id, 'buyer')
    and not public.is_deal_counsel(v_contract.deal_id, 'seller') then
    raise exception 'not on this deal' using errcode = 'insufficient_privilege';
  end if;

  return not public.contract_review_required(v_contract.deal_id, v_contract.type)
    or exists (
      select 1 from public.contract_signing_override o
      where o.contract_version_id = contract_version_signing_ready.contract_version_id
    )
    or (
      select count(*) from (
        select distinct on (r.side) r.decision
        from public.contract_review_decision r
        where r.contract_version_id = contract_version_signing_ready.contract_version_id
        order by r.side, r.decided_at desc
      ) latest
      where latest.decision in ('approved', 'approved_with_comments')
    ) = 2;
end;
$$;

create or replace function public.record_team_gate_was_required()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  new.was_required := public.contract_review_team_required(new.account_id, new.contract_type);
  return new;
end;
$$;

create trigger record_team_gate_was_required
  before insert on public.contract_review_gate_default_change
  for each row execute function public.record_team_gate_was_required();

-- ---- The deal's log ----
-- Logged so the timeline and notices can tell of them; the rows are written
-- by whoever acts, counsel included, so the entry is the service's.

create or replace function public.log_contract_review_event()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_contract public.contract;
  v_role text;
begin
  select c.* into v_contract
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where v.id = new.contract_version_id;

  v_role := current_setting('request.jwt.claim.role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.append_deal_event(v_contract.deal_id, 'contract', v_contract.id, tg_argv[0],
    jsonb_build_object('version_id', new.contract_version_id, 'id', new.id),
    null, 'service', tg_table_name);
  perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  return new;
end;
$$;

create trigger log_contract_review_event
  after insert on public.contract_review_request
  for each row execute function public.log_contract_review_event('contract.review_requested');

create trigger log_contract_review_event
  after insert on public.contract_review_decision
  for each row execute function public.log_contract_review_event('contract.review_decided');

create trigger log_contract_review_event
  after insert on public.contract_signing_override
  for each row execute function public.log_contract_review_event('contract.signing_overridden');

create or replace function public.log_deal_gate_change_event()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_role text;
begin
  v_role := current_setting('request.jwt.claim.role', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform public.append_deal_event(new.deal_id, 'deal', new.deal_id, 'deal.contract_review_gate_changed',
    jsonb_build_object('id', new.id, 'contract_type', new.contract_type,
      'was_required', new.was_required, 'required', new.required),
    null, 'service', tg_table_name);
  perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  return new;
end;
$$;

create trigger log_deal_gate_change_event
  after insert on public.deal_contract_review_gate_change
  for each row execute function public.log_deal_gate_change_event();

drop policy contract_review_request_read on public.contract_review_request;
drop policy contract_review_decision_read on public.contract_review_decision;
drop policy contract_signing_override_read on public.contract_signing_override;

create policy contract_review_request_read on public.contract_review_request
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.is_deal_counsel(
      (select c.deal_id from public.contract_version v join public.contract c on c.id = v.contract_id
       where v.id = contract_version_id),
      'buyer'
    )
    or public.is_deal_counsel(
      (select s.deal_id from public.seller_side_contract_version(contract_version_id) s),
      'seller'
    )
  );

create policy contract_review_decision_read on public.contract_review_decision
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or (
      side = 'buyer'
      and public.is_deal_counsel(
        (select c.deal_id from public.contract_version v join public.contract c on c.id = v.contract_id
         where v.id = contract_version_id),
        'buyer'
      )
    )
    or (
      side = 'seller'
      and public.is_deal_counsel(
        (select s.deal_id from public.seller_side_contract_version(contract_version_id) s),
        'seller'
      )
    )
  );

create policy contract_signing_override_read on public.contract_signing_override
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy contract_review_gate_default_change_read on public.contract_review_gate_default_change
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy contract_review_gate_default_change_insert on public.contract_review_gate_default_change
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_review_gate_default_change
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_review_gate_default_change
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create or replace function public.project_deal(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'deal.created' then
    insert into public.deal (id, account_id, firm_id, owner_user_id, description, asking_price, revenue_ttm, sde_ttm, ebitda_ttm, notes, source, stage, broker_contact_id, deal_box_version, capture_method, source_url, discovered_at, created_by_kind, created_by_ref, created_by_via, created_by, updated_by)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'firm_id')::uuid,
      (ev.payload ->> 'owner_user_id')::uuid,
      ev.payload ->> 'description',
      (ev.payload ->> 'asking_price')::numeric,
      (ev.payload ->> 'revenue_ttm')::numeric,
      (ev.payload ->> 'sde_ttm')::numeric,
      (ev.payload ->> 'ebitda_ttm')::numeric,
      ev.payload ->> 'notes',
      coalesce((ev.payload ->> 'source')::public.deal_source, 'manual'),
      coalesce(ev.payload ->> 'stage', 'sourcing'),
      (ev.payload ->> 'broker_contact_id')::uuid,
      (ev.payload ->> 'deal_box_version')::int,
      ev.payload ->> 'capture_method',
      ev.payload ->> 'source_url',
      coalesce((ev.payload ->> 'discovered_at')::timestamptz, ev.created_at),
      case ev.actor_kind
        when 'user' then 'user'
        when 'service' then 'workflow'
        when 'api_key' then 'agent'
        when 'system' then 'integration'
      end,
      ev.actor_ref::text,
      ev.actor_via,
      ev.actor_ref, ev.actor_ref
    )
    on conflict (id) do update set
      firm_id = excluded.firm_id,
      owner_user_id = excluded.owner_user_id,
      description = excluded.description,
      asking_price = excluded.asking_price,
      revenue_ttm = excluded.revenue_ttm,
      sde_ttm = excluded.sde_ttm,
      ebitda_ttm = excluded.ebitda_ttm,
      notes = excluded.notes,
      broker_contact_id = excluded.broker_contact_id,
      deal_box_version = excluded.deal_box_version,
      capture_method = excluded.capture_method,
      source_url = excluded.source_url,
      updated_by = excluded.updated_by;
    insert into public.deal_profile (deal_id, account_id, year_established, industry_id, industry, business_model, location_id, location_raw, employee_band, website, owner_role, reason_for_sale)
    values (
      ev.aggregate_id, ev.account_id,
      (ev.payload ->> 'year_established')::int,
      (ev.payload ->> 'industry_id')::uuid,
      ev.payload ->> 'industry',
      ev.payload ->> 'business_model',
      (ev.payload ->> 'location_id')::uuid,
      ev.payload ->> 'location_raw',
      ev.payload ->> 'employee_band',
      ev.payload ->> 'website',
      ev.payload ->> 'owner_role',
      ev.payload ->> 'reason_for_sale'
    )
    on conflict (deal_id) do update set
      year_established = excluded.year_established,
      industry_id = excluded.industry_id,
      industry = excluded.industry,
      business_model = excluded.business_model,
      location_id = excluded.location_id,
      location_raw = excluded.location_raw,
      employee_band = excluded.employee_band,
      website = excluded.website,
      owner_role = excluded.owner_role,
      reason_for_sale = excluded.reason_for_sale;
  elsif ev.event_type = 'deal.updated' then
    update public.deal set
      description = coalesce(ev.payload ->> 'description', description),
      asking_price = coalesce((ev.payload ->> 'asking_price')::numeric, asking_price),
      revenue_ttm = coalesce((ev.payload ->> 'revenue_ttm')::numeric, revenue_ttm),
      sde_ttm = coalesce((ev.payload ->> 'sde_ttm')::numeric, sde_ttm),
      ebitda_ttm = coalesce((ev.payload ->> 'ebitda_ttm')::numeric, ebitda_ttm),
      notes = coalesce(ev.payload ->> 'notes', notes),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
    update public.deal_profile set
      year_established = coalesce((ev.payload ->> 'year_established')::int, year_established),
      industry_id = coalesce((ev.payload ->> 'industry_id')::uuid, industry_id),
      industry = coalesce(ev.payload ->> 'industry', industry),
      business_model = coalesce(ev.payload ->> 'business_model', business_model),
      location_id = coalesce((ev.payload ->> 'location_id')::uuid, location_id),
      location_raw = coalesce(ev.payload ->> 'location_raw', location_raw),
      employee_band = coalesce(ev.payload ->> 'employee_band', employee_band),
      website = coalesce(ev.payload ->> 'website', website),
      owner_role = coalesce(ev.payload ->> 'owner_role', owner_role),
      reason_for_sale = coalesce(ev.payload ->> 'reason_for_sale', reason_for_sale)
    where deal_id = ev.aggregate_id;
  elsif ev.event_type = 'deal.stage_changed' then
    update public.deal set
      stage = ev.payload ->> 'stage',
      stage_changed_at = ev.created_at,
      outcome_reason = coalesce(ev.payload ->> 'outcome_reason', outcome_reason),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.resolved' then
    update public.deal set
      resolution = ev.payload ->> 'resolution',
      resolution_reason = ev.payload ->> 'resolution_reason',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.archived' then
    update public.deal set
      archived_at = coalesce((ev.payload ->> 'archived_at')::timestamptz, ev.created_at),
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.unarchived' then
    update public.deal set
      archived_at = null,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.listing_status_changed' then
    update public.deal set
      listing_status = ev.payload ->> 'listing_status',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.duplicate_flagged' then
    update public.deal set
      duplicate_of = (ev.payload ->> 'duplicate_of')::uuid,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.duplicate_cleared' then
    update public.deal set
      duplicate_of = null,
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.earnings_basis_changed' then
    update public.deal set
      earnings_basis = ev.payload ->> 'earnings_basis',
      updated_by = ev.actor_ref
    where id = ev.aggregate_id;
  elsif ev.event_type = 'deal.contract_review_gate_changed' then
  else
    raise exception 'unknown deal event %', ev.event_type;
  end if;
end;
$$;

create or replace function public.project_contract(ev public.deal_event)
  returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if ev.event_type = 'contract.created' then
    insert into public.contract (id, deal_id, account_id, type, status, current_version, source_offer_version_id, created_by)
    values (
      ev.aggregate_id, ev.deal_id, ev.account_id,
      ev.payload ->> 'type',
      ev.payload ->> 'status',
      (ev.payload ->> 'current_version')::int,
      (ev.payload ->> 'source_offer_version_id')::uuid,
      ev.actor_ref
    )
    on conflict (id) do update set
      status = excluded.status,
      current_version = excluded.current_version;
  elsif ev.event_type = 'contract.version_set' then
    update public.contract set
      current_version = (ev.payload ->> 'current_version')::int,
      status = coalesce(ev.payload ->> 'status', status)
    where id = ev.aggregate_id;
  -- Logged so counsel and the team can be told; the rows they name are
  -- written by the upload, the share and the comment themselves.
  elsif ev.event_type in ('contract.version_added', 'contract.version_shown_to_seller_side', 'contract.comment_posted',
    'contract.review_requested', 'contract.review_decided', 'contract.signing_overridden') then
  elsif ev.event_type = 'contract.signature_requested' then
    update public.contract_version cv set
      signing_document_id = ev.payload ->> 'signing_document_id',
      signing_status = 'draft'
    from public.contract c
    where cv.id = (ev.payload ->> 'version_id')::uuid
      and cv.contract_id = ev.aggregate_id
      and c.id = cv.contract_id
      and c.deal_id = ev.deal_id;
  elsif ev.event_type = 'contract.signature_status_changed' then
    update public.contract_version cv set signing_status = ev.payload ->> 'status'
    from public.contract c
    where cv.id = (ev.payload ->> 'version_id')::uuid
      and cv.contract_id = ev.aggregate_id
      and c.id = cv.contract_id
      and c.deal_id = ev.deal_id;
  else
    raise exception 'unknown contract event %', ev.event_type;
  end if;
end;
$$;
