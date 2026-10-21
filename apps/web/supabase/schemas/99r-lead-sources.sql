-- Public business records used to source acquisition targets. These are global
-- facts, shared across teams like comps and lender_brand: the service role
-- ingests and matches them, and any signed-in user reads them. Each source keeps
-- its own table because each source publishes a different shape; matching links
-- every record to one public_business. What a team learns on top (emails from a
-- paid lookup, a firm's verdict) is account-scoped and lives with the firm.

create type public.lead_source as enum ('ppp', 'sba_7a', 'sba_504', 'form_5500', 'state_registry');

create type public.registry_source as enum ('api', 'bulk_file');

create type public.lead_import_status as enum ('running', 'succeeded', 'failed');

-- One ingest run of one source file or API pull. Service role only.
create table if not exists public.lead_import (
  id uuid primary key default gen_random_uuid(),
  source public.lead_source not null,
  filename text,
  status public.lead_import_status not null default 'running',
  rows_read int not null default 0,
  rows_written int not null default 0,
  rows_rejected int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.lead_import enable row level security;

revoke all on public.lead_import from anon, authenticated, service_role;
grant select, insert, update, delete on public.lead_import to service_role;

-- ein and match_key are the match keys: EIN when a source carries one, else
-- the normalized name, postal code and street number the matcher computes.
create table if not exists public.public_business (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ein public.ein unique,
  match_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ppp_loan (
  loan_number text primary key,
  business_id uuid references public.public_business (id) on delete set null,
  import_id uuid references public.lead_import (id) on delete set null,
  borrower_name text not null,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  naics_code text,
  business_age_description text,
  jobs_reported int,
  loan_amount numeric,
  approved_on date
);

create table if not exists public.sba_loan (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  business_id uuid references public.public_business (id) on delete set null,
  import_id uuid references public.lead_import (id) on delete set null,
  program public.lead_source not null check (program in ('sba_7a', 'sba_504')),
  borrower_name text not null,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  naics_code text,
  jobs_supported int,
  loan_amount numeric,
  approved_on date
);

create table if not exists public.form_5500_filing (
  ack_id text primary key,
  business_id uuid references public.public_business (id) on delete set null,
  import_id uuid references public.lead_import (id) on delete set null,
  ein public.ein not null,
  sponsor_name text not null,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  participant_count int,
  plan_year_begin date
);

create table if not exists public.state_registry_entity (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  entity_number text not null,
  business_id uuid references public.public_business (id) on delete set null,
  import_id uuid references public.lead_import (id) on delete set null,
  name text not null,
  status text,
  formation_date date,
  registered_agent text,
  mailing_address_line1 text,
  mailing_city text,
  mailing_state text,
  mailing_postal_code text,
  source public.registry_source not null,
  fetched_at timestamptz not null,
  unique (state, entity_number)
);

create table if not exists public.state_registry_officer (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.state_registry_entity (id) on delete cascade,
  name text not null,
  title text
);

create index ix_ppp_loan_business on public.ppp_loan (business_id);
create index ix_sba_loan_business on public.sba_loan (business_id);
create index ix_form_5500_filing_business on public.form_5500_filing (business_id);
create index ix_form_5500_filing_ein on public.form_5500_filing (ein);
create index ix_state_registry_entity_business on public.state_registry_entity (business_id);
create index ix_state_registry_officer_entity on public.state_registry_officer (entity_id);

alter table public.public_business enable row level security;
revoke all on public.public_business from anon, authenticated, service_role;
grant select on public.public_business to authenticated;
grant select, insert, update, delete on public.public_business to service_role;
create policy public_business_read on public.public_business for select to authenticated using (true);

alter table public.ppp_loan enable row level security;
revoke all on public.ppp_loan from anon, authenticated, service_role;
grant select on public.ppp_loan to authenticated;
grant select, insert, update, delete on public.ppp_loan to service_role;
create policy ppp_loan_read on public.ppp_loan for select to authenticated using (true);

alter table public.sba_loan enable row level security;
revoke all on public.sba_loan from anon, authenticated, service_role;
grant select on public.sba_loan to authenticated;
grant select, insert, update, delete on public.sba_loan to service_role;
create policy sba_loan_read on public.sba_loan for select to authenticated using (true);

alter table public.form_5500_filing enable row level security;
revoke all on public.form_5500_filing from anon, authenticated, service_role;
grant select on public.form_5500_filing to authenticated;
grant select, insert, update, delete on public.form_5500_filing to service_role;
create policy form_5500_filing_read on public.form_5500_filing for select to authenticated using (true);

alter table public.state_registry_entity enable row level security;
revoke all on public.state_registry_entity from anon, authenticated, service_role;
grant select on public.state_registry_entity to authenticated;
grant select, insert, update, delete on public.state_registry_entity to service_role;
create policy state_registry_entity_read on public.state_registry_entity for select to authenticated using (true);

alter table public.state_registry_officer enable row level security;
revoke all on public.state_registry_officer from anon, authenticated, service_role;
grant select on public.state_registry_officer to authenticated;
grant select, insert, update, delete on public.state_registry_officer to service_role;
create policy state_registry_officer_read on public.state_registry_officer for select to authenticated using (true);

-- A registry record younger than 90 days is reused; only older or missing
-- records cost a paid fetch. fetched_at is the API fetch time, or the as-of
-- date of the bulk file the record came from.
create or replace function public.registry_entity_needs_fetch(p_state text, p_entity_number text)
  returns boolean
  language sql stable set search_path = '' as $$
  select not exists (
    select 1 from public.state_registry_entity
    where state = p_state
      and entity_number = p_entity_number
      and fetched_at > now() - interval '90 days'
  );
$$;

revoke all on function public.registry_entity_needs_fetch(text, text) from public, anon, authenticated;
grant execute on function public.registry_entity_needs_fetch(text, text) to service_role;

alter table public.firm
  add column public_business_id uuid references public.public_business (id) on delete set null;

create index ix_firm_public_business on public.firm (public_business_id);

-- Emails found by a team's paid lookup belong to that team alone.
create table if not exists public.firm_email (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid not null,
  email text not null,
  provider text not null,
  created_at timestamptz not null default now(),
  foreign key (firm_id, account_id) references public.firm (id, account_id) on delete cascade,
  unique (firm_id, email)
);

alter table public.firm_email enable row level security;

revoke all on public.firm_email from anon, authenticated, service_role;
grant select on public.firm_email to authenticated;
grant select, insert, update, delete on public.firm_email to service_role;

create policy firm_email_read on public.firm_email
  for select to authenticated
  using (public.has_role_on_account(account_id));

-- A team's own key for each paid provider. api_key_secret_ref names the secret
-- store entry, as llm_endpoint does, so the raw key never lives in a row.
create type public.provider_kind as enum ('email_lookup', 'registry', 'letters');

create table if not exists public.provider_credential (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind public.provider_kind not null,
  provider text not null,
  base_url text,
  api_key_secret_ref text not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (account_id, kind)
);

alter table public.provider_credential enable row level security;

revoke all on public.provider_credential from anon, authenticated, service_role;
grant select, insert, update, delete on public.provider_credential to authenticated;
grant select, insert, update, delete on public.provider_credential to service_role;

create trigger provider_credential_timestamps
  before insert or update on public.provider_credential
  for each row execute function public.set_timestamps();

create trigger provider_credential_user_tracking
  before insert or update on public.provider_credential
  for each row execute function public.set_user_tracking();

create policy provider_credential_read on public.provider_credential
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy provider_credential_insert on public.provider_credential
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy provider_credential_update on public.provider_credential
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

create policy provider_credential_delete on public.provider_credential
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'settings.manage'));

-- The decision model's call on a firm. A rerun appends a new verdict; a person's
-- approval is its own row, so an approval always names who gave it and when.
create table if not exists public.firm_verdict (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  firm_id uuid not null,
  endpoint_id uuid references public.llm_endpoint (id) on delete set null,
  fit boolean not null,
  reasons text[] not null,
  model text not null,
  created_at timestamptz not null default now(),
  foreign key (firm_id, account_id) references public.firm (id, account_id) on delete cascade,
  unique (id, account_id)
);

alter table public.firm_verdict enable row level security;

create index ix_firm_verdict_firm on public.firm_verdict (firm_id, created_at desc);

revoke all on public.firm_verdict from anon, authenticated, service_role;
grant select on public.firm_verdict to authenticated;
grant select, insert, update, delete on public.firm_verdict to service_role;

create policy firm_verdict_read on public.firm_verdict
  for select to authenticated
  using (public.has_role_on_account(account_id));

create table if not exists public.firm_verdict_approval (
  verdict_id uuid primary key,
  account_id uuid not null,
  approved_by uuid not null references auth.users default auth.uid(),
  approved_at timestamptz not null default now(),
  reason text check (btrim(reason) <> ''),
  foreign key (verdict_id, account_id) references public.firm_verdict (id, account_id) on delete cascade,
  unique (verdict_id, account_id)
);

alter table public.firm_verdict_approval enable row level security;

revoke all on public.firm_verdict_approval from anon, authenticated, service_role;
grant select, insert on public.firm_verdict_approval to authenticated;
grant select, insert, update, delete on public.firm_verdict_approval to service_role;

create policy firm_verdict_approval_read on public.firm_verdict_approval
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy firm_verdict_approval_insert on public.firm_verdict_approval
  for insert to authenticated
  with check (
    approved_by = (select auth.uid())
    and public.has_permission((select auth.uid()), account_id, 'deals.manage')
  );

-- Approving a not-fit verdict overrides the decision model, so it needs a reason.
create or replace function tuckin.require_override_reason()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if new.reason is null and not (select fit from public.firm_verdict where id = new.verdict_id) then
    raise exception 'overriding a not-fit verdict needs a reason' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger require_override_reason
  before insert on public.firm_verdict_approval
  for each row execute function tuckin.require_override_reason();

-- A revoked approval stays revoked; the firm needs a new verdict to be
-- approved again.
create table if not exists public.firm_verdict_revocation (
  verdict_id uuid primary key,
  account_id uuid not null,
  revoked_by uuid not null references auth.users default auth.uid(),
  revoked_at timestamptz not null default now(),
  reason text not null check (btrim(reason) <> ''),
  foreign key (verdict_id, account_id) references public.firm_verdict_approval (verdict_id, account_id) on delete cascade
);

alter table public.firm_verdict_revocation enable row level security;

revoke all on public.firm_verdict_revocation from anon, authenticated, service_role;
grant select, insert on public.firm_verdict_revocation to authenticated;
grant select, insert, update, delete on public.firm_verdict_revocation to service_role;

create policy firm_verdict_revocation_read on public.firm_verdict_revocation
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy firm_verdict_revocation_insert on public.firm_verdict_revocation
  for insert to authenticated
  with check (
    revoked_by = (select auth.uid())
    and public.has_permission((select auth.uid()), account_id, 'deals.manage')
  );

-- Outreach to a firm runs only while its latest verdict is approved and that
-- approval is not revoked.
create or replace function public.firm_outreach_approved(p_firm_id uuid)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select exists (
    select 1
    from (
      select v.id from public.firm_verdict v
      where v.firm_id = p_firm_id
      order by v.created_at desc, v.id desc
      limit 1
    ) latest
    join public.firm_verdict_approval a on a.verdict_id = latest.id
    where not exists (select 1 from public.firm_verdict_revocation r where r.verdict_id = latest.id)
  );
$$;

revoke all on function public.firm_outreach_approved(uuid) from public, anon;
grant execute on function public.firm_outreach_approved(uuid) to authenticated, service_role;

create or replace function tuckin.refuse_unapproved_firm_outreach()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if new.status = 'queued' and new.firm_id is not null and not public.firm_outreach_approved(new.firm_id) then
    raise exception 'firm outreach is not approved' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger refuse_unapproved_firm_outreach
  before insert or update of status, firm_id on public.outreach_enrollment
  for each row execute function tuckin.refuse_unapproved_firm_outreach();

-- What the team has taught the decision model. Override and revoke reasons land
-- here, deal managers add their own, and the model reads them on the team's
-- later verdicts; deal managers edit or delete them.
create table if not exists public.decision_fact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  verdict_id uuid,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  foreign key (verdict_id, account_id) references public.firm_verdict (id, account_id) on delete set null (verdict_id)
);

alter table public.decision_fact enable row level security;

create index ix_decision_fact_account on public.decision_fact (account_id);

revoke all on public.decision_fact from anon, authenticated, service_role;
grant select, insert, delete on public.decision_fact to authenticated;
grant update (body) on public.decision_fact to authenticated;
grant select, insert, update, delete on public.decision_fact to service_role;

create trigger decision_fact_timestamps
  before insert or update on public.decision_fact
  for each row execute function public.set_timestamps();

create trigger decision_fact_user_tracking
  before insert or update on public.decision_fact
  for each row execute function public.set_user_tracking();

create policy decision_fact_read on public.decision_fact
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy decision_fact_insert on public.decision_fact
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy decision_fact_update on public.decision_fact
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy decision_fact_delete on public.decision_fact
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create or replace function tuckin.record_override_fact()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not (select fit from public.firm_verdict where id = new.verdict_id) then
    insert into public.decision_fact (account_id, verdict_id, body)
    values (new.account_id, new.verdict_id, new.reason);
  end if;
  return null;
end;
$$;

create trigger record_override_fact
  after insert on public.firm_verdict_approval
  for each row when (new.reason is not null)
  execute function tuckin.record_override_fact();

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

create trigger apply_revocation
  after insert on public.firm_verdict_revocation
  for each row execute function tuckin.apply_revocation();

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

-- A weak match between a shared source record and a public business, as one
-- team sees it. A team's accept or reject steers only its own pipeline; the
-- shared records never change. Exactly one source record is named. Scores of
-- 0.9 and above link without review and scores below 0.6 are dropped, so only
-- the band between is stored.
create type public.match_review_status as enum ('pending', 'accepted', 'rejected');

create table if not exists public.business_match_review (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  business_id uuid not null references public.public_business (id) on delete cascade,
  ppp_loan_number text references public.ppp_loan (loan_number) on delete cascade,
  sba_loan_id uuid references public.sba_loan (id) on delete cascade,
  form_5500_ack_id text references public.form_5500_filing (ack_id) on delete cascade,
  registry_entity_id uuid references public.state_registry_entity (id) on delete cascade,
  score numeric not null check (score >= 0.6 and score < 0.9),
  status public.match_review_status not null default 'pending',
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(ppp_loan_number, sba_loan_id, form_5500_ack_id, registry_entity_id) = 1),
  check ((status = 'pending') = (reviewed_by is null) and (reviewed_by is null) = (reviewed_at is null)),
  unique nulls not distinct (account_id, business_id, ppp_loan_number, sba_loan_id, form_5500_ack_id, registry_entity_id)
);

alter table public.business_match_review enable row level security;

create index ix_business_match_review_account_status on public.business_match_review (account_id, status);

revoke all on public.business_match_review from anon, authenticated, service_role;
grant select on public.business_match_review to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.business_match_review to authenticated;
grant select, insert, update, delete on public.business_match_review to service_role;

create policy business_match_review_read on public.business_match_review
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy business_match_review_update on public.business_match_review
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (
    (reviewed_by is null or reviewed_by = (select auth.uid()))
    and public.has_permission((select auth.uid()), account_id, 'deals.manage')
  );

create type public.letter_status as enum ('queued', 'created', 'mailed', 'in_transit', 'delivered', 'returned', 'failed');

-- One mailed letter for a letter step. address_* is the address actually used,
-- copied at send time so later edits to the firm do not rewrite history.
-- step_ordinal mirrors outreach_message.step_id. The dispatcher records sends
-- through the service role; the team reads them.
create table if not exists public.outreach_letter (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  enrollment_id uuid not null,
  step_ordinal int not null,
  provider text not null,
  provider_letter_id text,
  address_line1 text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  status public.letter_status not null default 'queued',
  error text,
  cost_cents int,
  created_at timestamptz not null default now(),
  foreign key (enrollment_id, account_id) references public.outreach_enrollment (id, account_id) on delete cascade,
  unique (provider, provider_letter_id)
);

alter table public.outreach_letter enable row level security;

create index ix_outreach_letter_account_created on public.outreach_letter (account_id, created_at);

revoke all on public.outreach_letter from anon, authenticated, service_role;
grant select on public.outreach_letter to authenticated;
grant select, insert, update, delete on public.outreach_letter to service_role;

create policy outreach_letter_read on public.outreach_letter
  for select to authenticated
  using (public.has_role_on_account(account_id));

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

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_email
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.provider_credential
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_verdict
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_endpoint_id
  before insert or update on public.firm_verdict
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'endpoint_id', 'llm_endpoint');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_verdict_approval
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_letter
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_firm_id
  before insert or update on public.ai_call_log
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_verdict_revocation
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.decision_fact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.business_match_review
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');
