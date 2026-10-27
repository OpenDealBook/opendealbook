-- The Leads tab: one row per team firm that came from a lead pull. A firm's
-- source records are those linked to its public business plus those the team
-- accepted in match review. Security invoker, so the caller's RLS scopes it.
create or replace view public.lead_pipeline
  with (security_invoker = true) as
select
  f.id as firm_id,
  f.account_id,
  f.name,
  f.city,
  f.state,
  records.jobs,
  records.ppp_loan_amount,
  records.headcount,
  extract(year from age(records.formed_on))::int as business_age_years,
  coalesce(records.sources, '{}') as sources,
  exists (
    select 1 from public.business_match_review m
    where m.account_id = f.account_id and m.business_id = f.public_business_id and m.status = 'pending'
  ) as needs_review,
  case latest.fit when true then 'fit' when false then 'not_fit' end as verdict,
  case
    when latest.id is null then null
    when exists (select 1 from public.firm_verdict_revocation r where r.verdict_id = latest.id) then 'revoked'
    when exists (select 1 from public.firm_verdict_approval a where a.verdict_id = latest.id)
      then case when latest.fit then 'approved' else 'overridden' end
    when exists (
      select 1 from public.workflow_step_run s
      join public.workflow_approval w on w.step_run_id = s.id
      where s.output ->> 'verdictId' = latest.id::text and s.account_id = f.account_id and not w.approved
    ) then 'rejected'
    else 'awaiting_approval'
  end as approval,
  (select count(*)::int from public.firm_email e where e.firm_id = f.id) as email_count,
  case enrollment.status
    when 'queued' then 'sending'
    when 'held' then 'awaiting_approval'
    when 'sent' then 'done'
    when 'replied' then 'replied'
    when 'bounced' then 'bounced'
    when 'stopped' then 'stopped'
    when 'suppressed' then 'stopped'
    when 'failed' then 'stopped'
    else 'not_started'
  end as outreach
from public.firm f
left join lateral (
  select
    array_agg(distinct record.source order by record.source) as sources,
    max(record.jobs) as jobs,
    max(record.ppp_loan_amount) as ppp_loan_amount,
    (array_agg(record.headcount order by record.plan_year_begin desc nulls last)
      filter (where record.headcount is not null))[1] as headcount,
    min(record.formed_on) as formed_on
  from (
    select 'ppp'::public.lead_source as source, p.jobs_reported as jobs, p.loan_amount as ppp_loan_amount,
           null::int as headcount, null::date as plan_year_begin, null::date as formed_on
    from public.ppp_loan p
    where p.business_id = f.public_business_id
       or p.loan_number = any (array(
            select m.ppp_loan_number from public.business_match_review m
            where m.account_id = f.account_id and m.business_id = f.public_business_id and m.status = 'accepted'))
    union all
    select s.program, s.jobs_supported, null, null, null, null
    from public.sba_loan s
    where s.business_id = f.public_business_id
       or s.id = any (array(
            select m.sba_loan_id from public.business_match_review m
            where m.account_id = f.account_id and m.business_id = f.public_business_id and m.status = 'accepted'))
    union all
    select 'form_5500', null, null, x.participant_count, x.plan_year_begin, null
    from public.form_5500_filing x
    where x.business_id = f.public_business_id
       or x.ack_id = any (array(
            select m.form_5500_ack_id from public.business_match_review m
            where m.account_id = f.account_id and m.business_id = f.public_business_id and m.status = 'accepted'))
    union all
    select 'state_registry', null, null, null, null, g.formation_date
    from public.state_registry_entity g
    where g.business_id = f.public_business_id
       or g.id = any (array(
            select m.registry_entity_id from public.business_match_review m
            where m.account_id = f.account_id and m.business_id = f.public_business_id and m.status = 'accepted'))
  ) record
) records on true
left join lateral (
  select v.id, v.fit from public.firm_verdict v
  where v.firm_id = f.id
  order by v.created_at desc, v.id desc
  limit 1
) latest on true
left join lateral (
  select o.status from public.outreach_enrollment o
  where o.firm_id = f.id and o.account_id = f.account_id
  order by o.created_at desc, o.id desc
  limit 1
) enrollment on true
where f.public_business_id is not null;

create index if not exists ix_workflow_step_run_verdict on public.workflow_step_run ((output ->> 'verdictId'));

revoke all on public.lead_pipeline from anon, authenticated, service_role;
grant select on public.lead_pipeline to authenticated;

create or replace view public.lead_pipeline_state
  with (security_invoker = true) as
select distinct f.account_id, f.state
from public.firm f
where f.public_business_id is not null and f.state is not null;

revoke all on public.lead_pipeline_state from anon, authenticated, service_role;
grant select on public.lead_pipeline_state to authenticated;
