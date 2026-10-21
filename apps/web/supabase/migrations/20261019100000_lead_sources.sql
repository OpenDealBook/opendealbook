create domain public.ein as text check (value ~ '^\d{9}$');

alter table public.firm
  add column owner_mailing_address_line1 text,
  add column owner_mailing_city text,
  add column owner_mailing_state text,
  add column owner_mailing_postal_code text,
  add column ein public.ein,
  add column naics_code text,
  add column revenue_estimate numeric,
  add column profile text,
  add constraint firm_id_account_id_key unique (id, account_id);

alter table public.ai_call_log
  add column firm_id uuid references public.firm (id) on delete cascade;

create type public.outreach_channel as enum ('email', 'letter');

alter table public.outreach_step
  add column channel public.outreach_channel not null default 'email';

alter table public.outreach_enrollment
  add constraint outreach_enrollment_id_account_id_key unique (id, account_id);

-- Public business records used to source acquisition targets. These are global
-- facts, shared across teams like comps and lender_brand: the service role
-- ingests and matches them, and any signed-in user reads them. Each source keeps
-- its own table because each source publishes a different shape; matching links
-- every record to one public_business. What a team learns on top (emails from a
-- paid lookup, a firm's verdict) is account-scoped and lives with the firm.

create type public.lead_source as enum ('ppp', 'sba_7a', 'sba_504', 'form_5500', 'state_registry');

create type public.registry_source as enum ('api', 'bulk_file');

create table if not exists public.public_business (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ppp_loan (
  loan_number text primary key,
  business_id uuid references public.public_business (id) on delete set null,
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
  business_id uuid references public.public_business (id) on delete set null,
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
  name text not null,
  status text,
  formation_date date,
  officers jsonb not null default '[]'::jsonb,
  registered_agent text,
  mailing_address_line1 text,
  mailing_city text,
  mailing_state text,
  mailing_postal_code text,
  source public.registry_source not null,
  fetched_at timestamptz not null,
  unique (state, entity_number)
);

create index ix_ppp_loan_business on public.ppp_loan (business_id);
create index ix_sba_loan_business on public.sba_loan (business_id);
create index ix_form_5500_filing_business on public.form_5500_filing (business_id);
create index ix_form_5500_filing_ein on public.form_5500_filing (ein);
create index ix_state_registry_entity_business on public.state_registry_entity (business_id);

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

-- A registry record younger than 90 days is reused; only older or missing
-- records cost a paid fetch.
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

create table if not exists public.lead_import (
  id uuid primary key default gen_random_uuid(),
  source public.lead_source not null,
  filename text,
  created_at timestamptz not null default now()
);

alter table public.lead_import enable row level security;

revoke all on public.lead_import from anon, authenticated, service_role;
grant select, insert, update, delete on public.lead_import to service_role;

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
  updated_by uuid references auth.users
);

alter table public.provider_credential enable row level security;

create index ix_provider_credential_account on public.provider_credential (account_id);

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

-- The decision AI's call on a firm. A rerun appends a new verdict; a person's
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
  foreign key (verdict_id, account_id) references public.firm_verdict (id, account_id) on delete cascade
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
