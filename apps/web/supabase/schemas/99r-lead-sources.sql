-- Public business records used to source acquisition targets. These are global
-- facts, shared across teams like comps and lender_brand: the service role
-- ingests and matches them, and any signed-in user reads them. Each source keeps
-- its own table because each source publishes a different shape; matching links
-- every record to one public_business. What a team learns on top (emails from a
-- paid lookup, a firm's verdict) is account-scoped and lives with the firm.

create type public.lead_source as enum ('ppp', 'sba_7a', 'sba_504', 'form_5500', 'state_registry');

create type public.registry_source as enum ('api', 'bulk_file');

create type public.lead_import_status as enum ('running', 'succeeded', 'failed', 'skipped');

-- One ingest run of one source file or API pull. Service role only.
create table if not exists public.lead_import (
  id uuid primary key default gen_random_uuid(),
  source public.lead_source not null,
  filename text,
  created_at timestamptz not null default now(),
  status public.lead_import_status not null default 'running',
  rows_read int not null default 0,
  rows_written int not null default 0,
  rows_rejected int not null default 0,
  as_of date,
  rows_with_nulled_fields int not null default 0,
  error text,
  rows_unmatched int not null default 0
);

alter table public.lead_import enable row level security;

revoke all on public.lead_import from anon, authenticated, service_role;
grant select, insert, update, delete on public.lead_import to service_role;

-- ein and match_key are the match keys: EIN when a source carries one, else
-- the normalized name, postal code and street number the matcher computes.
create table if not exists public.public_business (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  ein public.ein unique,
  match_key text unique
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
  approved_on date,
  import_id uuid references public.lead_import (id) on delete set null
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
  approved_on date,
  source_key text not null unique,
  import_id uuid references public.lead_import (id) on delete set null
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
  plan_year_begin date,
  import_id uuid references public.lead_import (id) on delete set null
);

create table if not exists public.state_registry_entity (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  entity_number text not null,
  business_id uuid references public.public_business (id) on delete set null,
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
  import_id uuid references public.lead_import (id) on delete set null,
  source_id text,
  unique (state, entity_number)
);

create table if not exists public.state_registry_officer (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.state_registry_entity (id) on delete cascade,
  name text not null,
  title text,
  dataset text,
  import_id uuid references public.lead_import (id) on delete set null,
  constraint state_registry_officer_entity_dataset_name_title_key unique nulls not distinct (entity_id, dataset, name, title)
);

create index ix_ppp_loan_business on public.ppp_loan (business_id);
create index ix_sba_loan_business on public.sba_loan (business_id);
create index ix_form_5500_filing_business on public.form_5500_filing (business_id);
create index ix_form_5500_filing_ein on public.form_5500_filing (ein);
create index ix_state_registry_entity_business on public.state_registry_entity (business_id);
create unique index ux_state_registry_entity_source_id on public.state_registry_entity (state, source_id);
create index ix_state_registry_officer_entity on public.state_registry_officer (entity_id);
create index ix_public_business_match_key_prefix on public.public_business (match_key text_pattern_ops);

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

-- A newer import of a file is the truth for the fields that file carries, so
-- what it leaves blank is cleared; later batches of the same import only fill
-- in. Officers remember the file and import that last listed them, so a newer
-- import removes the ones it no longer lists for an entity, and only its own.
-- source_id is the id a state's other files use to refer to the entity, so
-- principals and agents published separately attach through it. A state that
-- publishes only active businesses marks the active bulk-file entities it
-- stopped listing, unless the file shrank below 80% of the last good one. A
-- row whose source id another row or entity already holds is refused rather
-- than failing the import.
create or replace function public.upsert_state_registry_entities(p_rows jsonb, p_supplied text[])
  returns table (id uuid, entity_number text)
  language sql
  set search_path = '' as $$
  with incoming as (
    select * from jsonb_populate_recordset(null::public.state_registry_entity, p_rows) with ordinality
  ),
  claimable as (
    select i.* from incoming i
    where i.source_id is null
      or not exists (
        select 1 from public.state_registry_entity held
        where held.state = i.state
          and held.source_id = i.source_id
          and held.entity_number <> i.entity_number
      )
  ),
  accepted as (
    select c.* from claimable c
    where c.source_id is null
      or not exists (
        select 1 from claimable earlier
        where earlier.state = c.state
          and earlier.source_id = c.source_id
          and earlier.ordinality < c.ordinality
      )
  )
  insert into public.state_registry_entity as e (
    state, entity_number, source_id, import_id, name, status, formation_date,
    registered_agent, mailing_address_line1, mailing_city, mailing_state,
    mailing_postal_code, source, fetched_at
  )
  select
    r.state, r.entity_number, r.source_id, r.import_id, r.name, r.status, r.formation_date,
    r.registered_agent, r.mailing_address_line1, r.mailing_city, r.mailing_state,
    r.mailing_postal_code, r.source, r.fetched_at
  from accepted r
  on conflict (state, entity_number) do update set
    source_id = case when e.import_id = excluded.import_id or not 'source_id' = any (p_supplied)
      then coalesce(excluded.source_id, e.source_id) else excluded.source_id end,
    status = case when e.import_id = excluded.import_id or not 'status' = any (p_supplied)
      then coalesce(excluded.status, e.status) else excluded.status end,
    formation_date = case when e.import_id = excluded.import_id or not 'formation_date' = any (p_supplied)
      then coalesce(excluded.formation_date, e.formation_date) else excluded.formation_date end,
    registered_agent = case when e.import_id = excluded.import_id or not 'registered_agent' = any (p_supplied)
      then coalesce(excluded.registered_agent, e.registered_agent) else excluded.registered_agent end,
    mailing_address_line1 = case when e.import_id = excluded.import_id or not 'mailing_address_line1' = any (p_supplied)
      then coalesce(excluded.mailing_address_line1, e.mailing_address_line1) else excluded.mailing_address_line1 end,
    mailing_city = case when e.import_id = excluded.import_id or not 'mailing_city' = any (p_supplied)
      then coalesce(excluded.mailing_city, e.mailing_city) else excluded.mailing_city end,
    mailing_state = case when e.import_id = excluded.import_id or not 'mailing_state' = any (p_supplied)
      then coalesce(excluded.mailing_state, e.mailing_state) else excluded.mailing_state end,
    mailing_postal_code = case when e.import_id = excluded.import_id or not 'mailing_postal_code' = any (p_supplied)
      then coalesce(excluded.mailing_postal_code, e.mailing_postal_code) else excluded.mailing_postal_code end,
    import_id = excluded.import_id,
    name = excluded.name,
    source = excluded.source,
    fetched_at = greatest(e.fetched_at, excluded.fetched_at)
  returning e.id, e.entity_number;
$$;

revoke all on function public.upsert_state_registry_entities(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.upsert_state_registry_entities(jsonb, text[]) to service_role;

create or replace function public.replace_state_registry_officers(
  p_dataset text,
  p_import_id uuid,
  p_entity_ids uuid[],
  p_officers jsonb
)
  returns void
  language sql
  set search_path = '' as $$
  insert into public.state_registry_officer (entity_id, dataset, import_id, name, title)
  select distinct o.entity_id, p_dataset, p_import_id, o.name, o.title
  from jsonb_to_recordset(p_officers) as o (entity_id uuid, name text, title text)
  on conflict (entity_id, dataset, name, title) do update set import_id = excluded.import_id;

  delete from public.state_registry_officer
  where entity_id = any (p_entity_ids)
    and dataset = p_dataset
    and import_id is distinct from p_import_id;
$$;

revoke all on function public.replace_state_registry_officers(text, uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.replace_state_registry_officers(text, uuid, uuid[], jsonb) to service_role;

create or replace function public.attach_state_registry_details(
  p_state text,
  p_dataset text,
  p_import_id uuid,
  p_rows jsonb
)
  returns int
  language sql
  set search_path = '' as $$
  update public.state_registry_entity e
  set registered_agent = r.registered_agent
  from jsonb_to_recordset(p_rows) as r (source_id text, registered_agent text)
  where e.state = p_state
    and e.source_id = r.source_id
    and r.registered_agent is not null;

  select public.replace_state_registry_officers(
    p_dataset,
    p_import_id,
    array(
      select e.id
      from jsonb_to_recordset(p_rows) as r (source_id text)
      join public.state_registry_entity e on e.state = p_state and e.source_id = r.source_id
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('entity_id', e.id, 'name', o.name, 'title', o.title)), '[]'::jsonb)
      from jsonb_to_recordset(p_rows) as r (source_id text, officers jsonb)
      join public.state_registry_entity e on e.state = p_state and e.source_id = r.source_id
      cross join jsonb_to_recordset(r.officers) as o (name text, title text)
    )
  );

  select coalesce(sum(r.rows), 0)::int
  from jsonb_to_recordset(p_rows) as r (source_id text, rows int)
  where not exists (
    select 1 from public.state_registry_entity e
    where e.state = p_state and e.source_id = r.source_id
  );
$$;

revoke all on function public.attach_state_registry_details(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.attach_state_registry_details(text, text, uuid, jsonb) to service_role;

create or replace function public.mark_unlisted_state_registry_entities(
  p_state text,
  p_import_id uuid,
  p_rows_read int
)
  returns boolean
  language plpgsql
  set search_path = '' as $$
declare
  v_baseline int;
begin
  select l.rows_read into v_baseline
  from public.lead_import l
  where l.filename = (select c.filename from public.lead_import c where c.id = p_import_id)
    and l.status = 'succeeded'
    and l.id <> p_import_id
  order by l.created_at desc
  limit 1;

  if v_baseline is null or p_rows_read < 0.8 * v_baseline then
    return false;
  end if;

  update public.state_registry_entity
  set status = 'inactive (no longer listed)'
  where state = p_state
    and source = 'bulk_file'
    and import_id <> p_import_id
    and status = 'active';
  return true;
end;
$$;

revoke all on function public.mark_unlisted_state_registry_entities(text, uuid, int) from public, anon, authenticated;
grant execute on function public.mark_unlisted_state_registry_entities(text, uuid, int) to service_role;

alter table public.firm add constraint firm_public_business_id_fkey
  foreign key (public_business_id) references public.public_business (id) on delete set null;

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

-- A team's own key for each provider: email lookup runs on Apify, letters on
-- Lob, federal courts on a free CourtListener token, and registry takes bulk
-- files only, so it has no key. The key lives
-- encrypted in Supabase Vault and members never see its secret id; settings
-- managers write only through save_provider_credential and
-- disconnect_provider_credential. Each kind has a fixed provider and address,
-- a changed address needs a fresh key, and email lookup names its Apify actor.
-- Letters also keep the Lob webhook signing secret in Vault beside the key.
create type public.provider_kind as enum ('email_lookup', 'registry', 'letters', 'courts');

create table if not exists public.provider_credential (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind public.provider_kind not null,
  provider text not null,
  base_url text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  api_key_secret_id uuid,
  actor_id text constraint provider_credential_actor_id check (actor_id ~ '^[A-Za-z0-9_.-]+([/~][A-Za-z0-9_.-]+)?$'),
  webhook_secret_id uuid,
  unique (account_id, kind)
);

alter table public.provider_credential enable row level security;

revoke all on public.provider_credential from anon, authenticated, service_role;
grant select (
  id, account_id, kind, provider, base_url, actor_id, created_at, updated_at, created_by, updated_by
) on public.provider_credential to authenticated;
grant select, insert, update, delete on public.provider_credential to service_role;

create trigger provider_credential_timestamps
  before insert or update on public.provider_credential
  for each row execute function public.set_timestamps();

create trigger provider_credential_user_tracking
  before insert or update on public.provider_credential
  for each row execute function public.set_user_tracking();

create policy provider_credential_read on public.provider_credential
  for select to authenticated
  using (public.has_role_on_account(account_id));

create or replace function public.save_provider_credential(
  p_account_id uuid,
  p_kind public.provider_kind,
  p_api_key text default null,
  p_actor_id text default null,
  p_webhook_secret text default null
)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  existing public.provider_credential;
  secret_id uuid;
  hook_secret_id uuid;
  provider text := case p_kind
    when 'email_lookup' then 'apify'
    when 'letters' then 'lob'
    when 'courts' then 'courtlistener'
  end;
  base_url text := case p_kind
    when 'email_lookup' then 'https://api.apify.com/v2'
    when 'letters' then 'https://api.lob.com/v1'
    when 'courts' then 'https://www.courtlistener.com/api/rest/v4'
  end;
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing provider keys needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  if p_kind = 'registry' then
    raise exception 'registry takes no key' using errcode = 'invalid_parameter_value';
  end if;

  if p_kind <> 'email_lookup' and p_actor_id is not null then
    raise exception 'only email lookup takes an actor' using errcode = 'invalid_parameter_value';
  end if;

  if p_actor_id !~ '^[A-Za-z0-9_.-]+([/~][A-Za-z0-9_.-]+)?$' then
    raise exception 'use an Apify actor id' using errcode = 'invalid_text_representation';
  end if;

  if p_kind <> 'letters' and p_webhook_secret is not null then
    raise exception 'only letters take a webhook secret' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('provider_credential:' || p_account_id || ':' || p_kind, 0));

  select * into existing from public.provider_credential where account_id = p_account_id and kind = p_kind;
  secret_id := existing.api_key_secret_id;
  hook_secret_id := existing.webhook_secret_id;

  if p_api_key is null and (
    secret_id is null
    or existing.provider is distinct from provider
    or existing.base_url is distinct from base_url
  ) then
    raise exception 'paste an API key' using errcode = 'check_violation';
  end if;

  if p_api_key is not null and secret_id is not null then
    perform vault.update_secret(secret_id, p_api_key);
  elsif p_api_key is not null then
    secret_id := vault.create_secret(p_api_key);
  end if;

  if p_webhook_secret is not null and hook_secret_id is not null then
    perform vault.update_secret(hook_secret_id, p_webhook_secret);
  elsif p_webhook_secret is not null then
    hook_secret_id := vault.create_secret(p_webhook_secret);
  end if;

  insert into public.provider_credential (account_id, kind, provider, base_url, api_key_secret_id, actor_id, webhook_secret_id)
  values (
    p_account_id, p_kind, provider, base_url, secret_id,
    case when p_kind = 'email_lookup'
      then coalesce(replace(p_actor_id, '~', '/'), existing.actor_id, 'vdrmota/contact-info-scraper')
    end,
    hook_secret_id
  )
  on conflict (account_id, kind) do update
    set provider = excluded.provider,
        base_url = excluded.base_url,
        api_key_secret_id = excluded.api_key_secret_id,
        actor_id = excluded.actor_id,
        webhook_secret_id = excluded.webhook_secret_id;
end;
$$;

revoke all on function public.save_provider_credential(uuid, public.provider_kind, text, text, text) from public, anon;
grant execute on function public.save_provider_credential(uuid, public.provider_kind, text, text, text) to authenticated;

create or replace function public.disconnect_provider_credential(p_account_id uuid, p_kind public.provider_kind)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not public.has_permission((select auth.uid()), p_account_id, 'settings.manage') then
    raise exception 'changing provider keys needs settings.manage' using errcode = 'insufficient_privilege';
  end if;

  delete from public.provider_credential where account_id = p_account_id and kind = p_kind;
end;
$$;

revoke all on function public.disconnect_provider_credential(uuid, public.provider_kind) from public, anon;
grant execute on function public.disconnect_provider_credential(uuid, public.provider_kind) to authenticated;

create or replace function public.provider_key(p_account_id uuid, p_kind public.provider_kind)
  returns table (api_key text, actor_id text, provider text, base_url text)
  language sql stable security definer
  set search_path = '' as $$
  select s.decrypted_secret, c.actor_id, c.provider, c.base_url
  from public.provider_credential c
  join vault.decrypted_secrets s on s.id = c.api_key_secret_id
  where c.account_id = p_account_id and c.kind = p_kind;
$$;

revoke all on function public.provider_key(uuid, public.provider_kind) from public, anon, authenticated;
grant execute on function public.provider_key(uuid, public.provider_kind) to service_role;

create or replace function public.letter_webhook_secret(p_account_id uuid)
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select s.decrypted_secret
  from public.provider_credential c
  join vault.decrypted_secrets s on s.id = c.webhook_secret_id
  where c.account_id = p_account_id and c.kind = 'letters';
$$;

revoke all on function public.letter_webhook_secret(uuid) from public, anon, authenticated;
grant execute on function public.letter_webhook_secret(uuid) to service_role;

create or replace function tuckin.delete_provider_credential_secret()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from vault.secrets where id in (old.api_key_secret_id, old.webhook_secret_id);
  return null;
end;
$$;

create trigger delete_provider_credential_secret
  after delete on public.provider_credential
  for each row execute function tuckin.delete_provider_credential_secret();

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
  approved_by uuid references auth.users on delete set null default auth.uid(),
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
-- 0.9 and above link without review and scores below 0.6 are dropped. Weak
-- matches store the band between; a strong match to a business holding a
-- different EIN is stored as an ein_conflict.
create type public.match_review_status as enum ('pending', 'accepted', 'rejected');

create type public.match_review_reason as enum ('weak_match', 'ein_conflict');

create table if not exists public.business_match_review (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  business_id uuid not null references public.public_business (id) on delete cascade,
  ppp_loan_number text references public.ppp_loan (loan_number) on delete cascade,
  sba_loan_id uuid references public.sba_loan (id) on delete cascade,
  form_5500_ack_id text references public.form_5500_filing (ack_id) on delete cascade,
  registry_entity_id uuid references public.state_registry_entity (id) on delete cascade,
  score numeric not null,
  status public.match_review_status not null default 'pending',
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  reason public.match_review_reason not null default 'weak_match',
  check (num_nonnulls(ppp_loan_number, sba_loan_id, form_5500_ack_id, registry_entity_id) = 1),
  check ((status = 'pending') = (reviewed_by is null) and (reviewed_by is null) = (reviewed_at is null)),
  constraint business_match_review_score_check check (
    case reason
      when 'weak_match' then score >= 0.6 and score < 0.9
      when 'ein_conflict' then score >= 0.9
    end
  ),
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

-- One mailed letter, for a sequence letter step or sent straight from a
-- workflow. address_* is the verified address actually used, copied at send
-- time so later edits to the firm do not rewrite history. step_ordinal mirrors
-- outreach_message.step_id. idempotency_key is the sender's retry key, also sent
-- to the provider. Senders record letters through the service role; the team
-- reads them.
create table if not exists public.outreach_letter (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  enrollment_id uuid,
  step_ordinal int,
  provider text not null,
  provider_letter_id text,
  address_line1 text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  cost_cents int,
  created_at timestamptz not null default now(),
  status public.letter_status not null default 'queued',
  error text,
  idempotency_key text unique,
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
