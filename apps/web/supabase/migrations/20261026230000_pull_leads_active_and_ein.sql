-- A pull skips businesses whose newest registry record says they no longer
-- trade, and links a team firm already known by EIN instead of adding a
-- duplicate. Registry status is raw text per state, so inactive is matched by
-- the words states use.

create or replace function public.pull_leads(
  p_pull_id uuid,
  p_account_id uuid,
  p_sources public.lead_source[],
  p_states text[],
  p_limit int,
  p_min_jobs int default null,
  p_max_jobs int default null,
  p_min_ppp_loan numeric default null,
  p_max_ppp_loan numeric default null,
  p_min_age_years int default null,
  p_min_headcount int default null,
  p_max_headcount int default null
)
  returns uuid[]
  language plpgsql
  set search_path = '' as $$
declare
  v_firm_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended('lead_pull:' || p_account_id::text, 0));

  select firm_ids into v_firm_ids from public.lead_pull where id = p_pull_id and account_id = p_account_id;
  if found then
    return v_firm_ids;
  end if;

  with rejected as (
    select * from public.business_match_review where account_id = p_account_id and status = 'rejected'
  ),
  record as (
    select p.business_id, 'ppp'::public.lead_source as source, p.state, p.jobs_reported as jobs,
           p.loan_amount as ppp_loan, null::int as headcount, null::date as formed_on
    from public.ppp_loan p
    where p.business_id is not null
      and not exists (select 1 from rejected r where r.ppp_loan_number = p.loan_number)
    union all
    select s.business_id, s.program, s.state, s.jobs_supported, null, null, null
    from public.sba_loan s
    where s.business_id is not null
      and not exists (select 1 from rejected r where r.sba_loan_id = s.id)
    union all
    select x.business_id, 'form_5500', x.state, null, null, x.participant_count, null
    from public.form_5500_filing x
    where x.business_id is not null
      and not exists (select 1 from rejected r where r.form_5500_ack_id = x.ack_id)
    union all
    select g.business_id, 'state_registry', g.state, null, null, null, g.formation_date
    from public.state_registry_entity g
    where g.business_id is not null
      and not exists (select 1 from rejected r where r.registry_entity_id = g.id)
  ),
  candidate as (
    select record.business_id
    from record
    group by record.business_id
    having bool_or(record.source = any (p_sources))
      and (cardinality(p_states) = 0 or bool_or(record.state = any (p_states)))
      and (num_nonnulls(p_min_jobs, p_max_jobs) = 0
        or bool_or(record.jobs >= coalesce(p_min_jobs, 0) and record.jobs <= coalesce(p_max_jobs, record.jobs)))
      and (num_nonnulls(p_min_ppp_loan, p_max_ppp_loan) = 0
        or bool_or(record.ppp_loan >= coalesce(p_min_ppp_loan, 0) and record.ppp_loan <= coalesce(p_max_ppp_loan, record.ppp_loan)))
      and (num_nonnulls(p_min_headcount, p_max_headcount) = 0
        or bool_or(record.headcount >= coalesce(p_min_headcount, 0) and record.headcount <= coalesce(p_max_headcount, record.headcount)))
      and (p_min_age_years is null
        or bool_or(record.formed_on <= current_date - make_interval(years => p_min_age_years)))
  ),
  picked as (
    select b.id as business_id, b.name, b.ein, (
      select f.id from public.firm f
      where f.account_id = p_account_id and f.public_business_id is null and f.ein = b.ein
      order by f.created_at, f.id
      limit 1
    ) as known_firm_id
    from candidate c
    join public.public_business b on b.id = c.business_id
    where not exists (
      select 1 from public.firm f where f.account_id = p_account_id and f.public_business_id = b.id
    )
      and not exists (
        select 1 from (
          select g.status from public.state_registry_entity g
          where g.business_id = b.id
          order by g.fetched_at desc
          limit 1
        ) newest
        where newest.status ~* '\m(dissolved|inactive|revoked|forfeited|withdrawn|cancell?ed|terminated|merged|expired)\M'
      )
    order by b.created_at, b.id
    limit p_limit
  ),
  linked as (
    update public.firm f set public_business_id = p.business_id
    from picked p
    where f.id = p.known_firm_id
    returning f.id
  ),
  added as (
    insert into public.firm (account_id, name, ein, public_business_id)
    select p_account_id, left(p.name, 255), p.ein, p.business_id
    from picked p
    where p.known_firm_id is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_firm_ids
  from (select id from linked union all select id from added) pulled;

  insert into public.lead_pull (id, account_id, firm_ids) values (p_pull_id, p_account_id, v_firm_ids);
  return v_firm_ids;
end;
$$;

revoke all on function public.pull_leads(
  uuid, uuid, public.lead_source[], text[], int, int, int, numeric, numeric, int, int, int
) from public, anon, authenticated;
grant execute on function public.pull_leads(
  uuid, uuid, public.lead_source[], text[], int, int, int, numeric, numeric, int, int, int
) to service_role;
