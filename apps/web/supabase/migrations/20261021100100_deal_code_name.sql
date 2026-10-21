-- Code name: an optional per-deal name for outside parties, unique in the
-- team. Lenders see it in place of the business name; the description never
-- leaves the team, and the seller's side sees the business name.
alter table public.deal add column code_name text check (char_length(code_name) between 2 and 40);
create unique index ux_deal_account_code_name on public.deal (account_id, code_name);


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
    if exists (
      select 1 from public.deal d
      join public.firm f on f.id = d.firm_id
      where d.id = ev.aggregate_id and strpos(ev.payload ->> 'code_name', f.name) > 0
    ) then
      raise exception 'a code name must not contain the business name' using errcode = 'check_violation';
    end if;
    update public.deal set
      description = coalesce(ev.payload ->> 'description', description),
      code_name = case when ev.payload ? 'code_name' then ev.payload ->> 'code_name' else code_name end,
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

drop function public.seller_deal_header(uuid);

create or replace function public.seller_deal_header(deal_id uuid)
  returns table (id uuid, deal_name text, stage text)
  language sql stable security definer
  set search_path = '' as $$
  select d.id, f.name::text, d.stage
  from public.deal d
  left join public.firm f on f.id = d.firm_id
  where d.id = seller_deal_header.deal_id
    and public.is_deal_seller(seller_deal_header.deal_id);
$$;

revoke all on function public.seller_deal_header(uuid) from public, anon;
grant execute on function public.seller_deal_header(uuid) to authenticated, service_role;

drop function public.my_seller_rooms();

create or replace function public.my_seller_rooms()
  returns table (
    id uuid,
    deal_id uuid,
    deal_name text,
    team_name text,
    team_picture_url text,
    is_open boolean
  )
  language plpgsql stable security definer
  set search_path = '' as $$
begin
  return query
  select r.id, r.deal_id, f.name::text, a.name::text, a.picture_url::text, public.seller_room_is_open(r)
  from public.seller_room r
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = r.account_id
  where exists (
      select 1 from public.seller_room_member m
      where m.room_id = r.id and m.user_id = (select auth.uid())
    )
    or public.is_deal_counsel(r.deal_id, 'seller')
  order by a.name, f.name;
end;
$$;

revoke all on function public.my_seller_rooms() from public, anon;
grant execute on function public.my_seller_rooms() to authenticated, service_role;

drop function public.seller_room_view(uuid);

create or replace function public.seller_room_view(room_id uuid)
  returns table (
    id uuid,
    deal_id uuid,
    deal_name text,
    team_name text,
    team_picture_url text,
    is_open boolean,
    welcome_note text,
    uploads_folder_id uuid
  )
  language sql stable security definer
  set search_path = '' as $$
  select r.id, r.deal_id, f.name::text, a.name::text, a.picture_url::text,
    public.seller_room_is_open(r), r.welcome_note, r.uploads_folder_id
  from public.seller_room r
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  join public.accounts a on a.id = r.account_id
  where r.id = seller_room_view.room_id
    and (
      public.can_manage_seller_room(r.id)
      or exists (
        select 1 from public.seller_room_member m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.seller_room_view(uuid) from public, anon;
grant execute on function public.seller_room_view(uuid) to authenticated, service_role;

create or replace function public.lender_room_view(room_id uuid)
  returns setof public.lender_room_summary
  language sql security definer
  set search_path = '' as $$
  select
    r.id,
    r.deal_id,
    r.name,
    case when a.full_row then r.welcome_note end,
    r.expires_at,
    public.lender_room_is_open(r),
    case when a.full_row then r.private_folder_id end,
    case when a.full_row then p.master_folder_id end,
    b.name,
    b.logo_path,
    coalesce(d.code_name, f.name::text),
    null::text,
    case when a.full_row then public.close_date(d) end,
    case when a.full_row then dl.must_close_by end,
    case when a.full_row then dl.must_close_reason end
  from public.lender_room r
  cross join lateral (
    select
      public.can_manage_lender_room(r.id) as manages,
      public.can_manage_lender_room(r.id) or public.lender_room_is_open(r) as full_row
  ) a
  join public.deal d on d.id = r.deal_id
  left join public.firm f on f.id = d.firm_id
  left join public.lender_package p on p.deal_id = r.deal_id
  left join public.lender_brand b on b.domain = r.brand_domain
  left join lateral public.lender_room_deadline(r.deal_id) dl on true
  where r.id = lender_room_view.room_id
    and (
      (select auth.role()) = 'service_role'
      or a.manages
      or exists (
        select 1 from public.lender_room_member m
        where m.room_id = r.id and m.user_id = (select auth.uid())
      )
    );
$$;
