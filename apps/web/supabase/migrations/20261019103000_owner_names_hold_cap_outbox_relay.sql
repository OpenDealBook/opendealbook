alter table public.firm add column owner_names text[] not null default '{}';
update public.firm set owner_names = array[owner_name] where owner_name is not null;
alter table public.firm
  drop column owner_name,
  add column profile_generated_at timestamptz,
  add column profile_model text;

alter table public.business_match_review
  add constraint business_match_review_score_check check (score >= 0.6 and score < 0.9);

grant insert on public.decision_fact to authenticated;

create policy decision_fact_insert on public.decision_fact
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

alter table public.outreach_enrollment drop constraint outreach_enrollment_status_check;
alter table public.outreach_enrollment add constraint outreach_enrollment_status_check
  check (status in ('queued', 'held', 'sent', 'replied', 'stopped', 'suppressed', 'failed'));

create or replace function tuckin.apply_revocation()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  revoked_firm_id uuid := (select firm_id from public.firm_verdict where id = new.verdict_id);
begin
  update public.outreach_enrollment
  set status = 'stopped'
  where firm_id = revoked_firm_id
    and account_id = new.account_id
    and status in ('queued', 'held')
    and not public.firm_outreach_approved(revoked_firm_id);

  insert into public.decision_fact (account_id, verdict_id, body)
  values (new.account_id, new.verdict_id, new.reason);

  return null;
end;
$$;

-- A new verdict waits for approval, so the firm's queued outreach is held until
-- a deal manager approves it.
create or replace function tuckin.hold_outreach_for_new_verdict()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.outreach_enrollment
  set status = 'held'
  where firm_id = new.firm_id and account_id = new.account_id and status = 'queued';
  return null;
end;
$$;

create trigger hold_outreach_for_new_verdict
  after insert on public.firm_verdict
  for each row execute function tuckin.hold_outreach_for_new_verdict();

create or replace function tuckin.release_held_outreach()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  approved_firm_id uuid := (select firm_id from public.firm_verdict where id = new.verdict_id);
begin
  update public.outreach_enrollment
  set status = 'queued'
  where firm_id = approved_firm_id
    and account_id = new.account_id
    and status = 'held'
    and public.firm_outreach_approved(approved_firm_id);
  return null;
end;
$$;

create trigger release_held_outreach
  after insert on public.firm_verdict_approval
  for each row execute function tuckin.release_held_outreach();

update public.outreach_enrollment e
set status = 'stopped'
where e.status = 'queued'
  and e.firm_id is not null
  and not exists (select 1 from public.firm_verdict v where v.firm_id = e.firm_id);

alter table public.outreach_setting add column letter_monthly_cap int not null default 0;

create or replace function tuckin.refuse_letter_over_monthly_cap()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  cap int;
begin
  perform pg_advisory_xact_lock(hashtextextended('outreach_letter_cap:' || new.account_id, 0));
  cap := coalesce((select letter_monthly_cap from public.outreach_setting where account_id = new.account_id), 0);
  if (select count(*) from public.outreach_letter
      where account_id = new.account_id and created_at >= month_start) >= cap then
    raise exception 'monthly letter cap reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger refuse_letter_over_monthly_cap
  before insert on public.outreach_letter
  for each row execute function tuckin.refuse_letter_over_monthly_cap();

alter table public.outreach_message drop constraint outreach_message_status_check;
alter table public.outreach_message add constraint outreach_message_status_check
  check (status in ('sending', 'sent', 'failed'));
alter table public.outreach_message
  add constraint outreach_message_enrollment_id_step_id_key unique (enrollment_id, step_id);

alter table public.notifications add column dedupe_key text unique;

-- How far each long-running event relay has read deal_event, by global_seq, so
-- a restarted relay resumes where it stopped. Service role only.

create table if not exists public.relay_cursor (
  name text primary key,
  last_global_seq bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.relay_cursor enable row level security;

revoke all on public.relay_cursor from anon, authenticated, service_role;
grant select, insert, update, delete on public.relay_cursor to service_role;

create or replace function tuckin.touch_relay_cursor()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_relay_cursor
  before update on public.relay_cursor
  for each row execute function tuckin.touch_relay_cursor();
