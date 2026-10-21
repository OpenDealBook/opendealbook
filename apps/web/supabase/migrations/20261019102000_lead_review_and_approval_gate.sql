alter table public.public_business
  add column ein public.ein unique,
  add column match_key text unique;

create type public.lead_import_status as enum ('running', 'succeeded', 'failed');

alter table public.lead_import
  add column status public.lead_import_status not null default 'running',
  add column rows_read int not null default 0,
  add column rows_written int not null default 0,
  add column rows_rejected int not null default 0;

alter table public.ppp_loan add column import_id uuid references public.lead_import (id) on delete set null;
alter table public.sba_loan
  add column source_key text not null unique,
  add column import_id uuid references public.lead_import (id) on delete set null;
alter table public.form_5500_filing add column import_id uuid references public.lead_import (id) on delete set null;
alter table public.state_registry_entity
  add column import_id uuid references public.lead_import (id) on delete set null,
  drop column officers;

create table if not exists public.state_registry_officer (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.state_registry_entity (id) on delete cascade,
  name text not null,
  title text
);

create index ix_state_registry_officer_entity on public.state_registry_officer (entity_id);

alter table public.state_registry_officer enable row level security;
revoke all on public.state_registry_officer from anon, authenticated, service_role;
grant select on public.state_registry_officer to authenticated;
grant select, insert, update, delete on public.state_registry_officer to service_role;
create policy state_registry_officer_read on public.state_registry_officer for select to authenticated using (true);

drop index public.ix_provider_credential_account;
alter table public.provider_credential add constraint provider_credential_account_id_kind_key unique (account_id, kind);

alter table public.firm add constraint firm_naics_code_check check (naics_code ~ '^\d{2,6}$');

alter table public.outreach_step alter column subject drop not null;
alter table public.outreach_step add constraint outreach_step_check check (channel = 'letter' or subject is not null);

alter table public.firm_verdict_approval
  add column reason text constraint firm_verdict_approval_reason_check check (btrim(reason) <> ''),
  add constraint firm_verdict_approval_verdict_id_account_id_key unique (verdict_id, account_id);

create type public.letter_status as enum ('queued', 'created', 'mailed', 'in_transit', 'delivered', 'returned', 'failed');

alter table public.outreach_letter
  add column status public.letter_status not null default 'queued',
  add column error text;

-- Approving a not-fit verdict overrides the decision AI, so it needs a reason.
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

-- What the team has taught the decision AI. Override and revoke reasons land
-- here and the AI reads them on the team's later verdicts; deal managers edit
-- or delete them.
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
grant select, delete on public.decision_fact to authenticated;
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
    and status = 'queued'
    and not public.firm_outreach_approved(revoked_firm_id);

  insert into public.decision_fact (account_id, verdict_id, body)
  values (new.account_id, new.verdict_id, new.reason);

  return null;
end;
$$;

create trigger apply_revocation
  after insert on public.firm_verdict_revocation
  for each row execute function tuckin.apply_revocation();

-- A weak match between a shared source record and a public business, as one
-- team sees it. A team's accept or reject steers only its own pipeline; the
-- shared records never change. Exactly one source record is named.
create type public.match_review_status as enum ('pending', 'accepted', 'rejected');

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

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_verdict_revocation
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.decision_fact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.business_match_review
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');
