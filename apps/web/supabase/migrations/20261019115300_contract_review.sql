-- Counsel sign-off on one exact contract version before it goes for signature.
-- Each side decides a version once; a side without counsel on the deal is
-- confirmed by its own party instead. Whether a contract type needs sign-off
-- is a team default that each deal may change, and every deal change is kept.

create type public.contract_review_verdict as enum ('approved', 'changes_needed', 'approved_with_comments');

create table if not exists public.contract_review_request (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_version_id uuid not null references public.contract_version (id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists ix_contract_review_request_version on public.contract_review_request (contract_version_id);

create table if not exists public.contract_review_decision (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_version_id uuid not null references public.contract_version (id) on delete cascade,
  side public.counsel_side not null,
  decision public.contract_review_verdict not null,
  note text,
  decided_by uuid not null references auth.users on delete cascade,
  without_counsel boolean not null,
  decided_at timestamptz not null default now(),
  unique (contract_version_id, side)
);

create table if not exists public.contract_signing_override (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_version_id uuid not null references public.contract_version (id) on delete cascade,
  reason text not null,
  overridden_by uuid not null default auth.uid() references auth.users on delete cascade,
  overridden_at timestamptz not null default now()
);

create index if not exists ix_contract_signing_override_version on public.contract_signing_override (contract_version_id);

create table if not exists public.contract_review_gate_default (
  account_id uuid not null references public.accounts (id) on delete cascade,
  contract_type text not null check (contract_type in ('loi', 'apa')),
  required boolean not null,
  primary key (account_id, contract_type)
);

create table if not exists public.deal_contract_review_gate_change (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  contract_type text not null check (contract_type in ('loi', 'apa')),
  was_required boolean not null,
  required boolean not null,
  changed_by uuid not null default auth.uid() references auth.users on delete cascade,
  changed_at timestamptz not null default clock_timestamp()
);

create index if not exists ix_deal_contract_review_gate_change_deal
  on public.deal_contract_review_gate_change (deal_id, contract_type, changed_at);

alter table public.contract_review_request enable row level security;
alter table public.contract_review_decision enable row level security;
alter table public.contract_signing_override enable row level security;
alter table public.contract_review_gate_default enable row level security;
alter table public.deal_contract_review_gate_change enable row level security;

revoke all on public.contract_review_request from anon, authenticated, service_role;
revoke all on public.contract_review_decision from anon, authenticated, service_role;
revoke all on public.contract_signing_override from anon, authenticated, service_role;
revoke all on public.contract_review_gate_default from anon, authenticated, service_role;
revoke all on public.deal_contract_review_gate_change from anon, authenticated, service_role;

grant select, insert (account_id, contract_version_id) on public.contract_review_request to authenticated;
grant select, insert (account_id, contract_version_id, side, decision, note, decided_by, without_counsel)
  on public.contract_review_decision to authenticated;
grant select, insert (account_id, contract_version_id, reason) on public.contract_signing_override to authenticated;
grant select, insert, update (required) on public.contract_review_gate_default to authenticated;
grant select, insert (account_id, deal_id, contract_type, required) on public.deal_contract_review_gate_change to authenticated;

grant select, insert, update, delete on public.contract_review_request to service_role;
grant select, insert, update, delete on public.contract_review_decision to service_role;
grant select, insert, update, delete on public.contract_signing_override to service_role;
grant select, insert, update, delete on public.contract_review_gate_default to service_role;
grant select, insert, update, delete on public.deal_contract_review_gate_change to service_role;

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
      select t.required from public.contract_review_gate_default t
      join public.deal d on d.account_id = t.account_id
      where d.id = contract_review_required.deal_id and t.contract_type = contract_review_required.contract_type
    ),
    contract_review_required.contract_type = 'apa'
  );
$$;

revoke all on function public.contract_review_required(uuid, text) from public, anon;
grant execute on function public.contract_review_required(uuid, text) to authenticated, service_role;

create or replace function public.contract_version_signing_ready(contract_version_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select not public.contract_review_required(c.deal_id, c.type)
    or exists (
      select 1 from public.contract_signing_override o
      where o.contract_version_id = v.id
    )
    or (
      select count(*) from public.contract_review_decision r
      where r.contract_version_id = v.id and r.decision in ('approved', 'approved_with_comments')
    ) = 2
  from public.contract_version v
  join public.contract c on c.id = v.contract_id
  where v.id = contract_version_signing_ready.contract_version_id;
$$;

revoke all on function public.contract_version_signing_ready(uuid) from public, anon;
grant execute on function public.contract_version_signing_ready(uuid) to authenticated, service_role;

create or replace function public.record_gate_was_required()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  new.was_required := public.contract_review_required(new.deal_id, new.contract_type);
  return new;
end;
$$;

create trigger record_gate_was_required
  before insert on public.deal_contract_review_gate_change
  for each row execute function public.record_gate_was_required();

-- ---- Who may do what ----
-- The seller side reads no version rows, so seller's counsel reach a version
-- through seller_side_contract_version, which shows only what they were shown.

create policy contract_review_request_read on public.contract_review_request
  for select to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_review_request_insert on public.contract_review_request
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_review_decision_read on public.contract_review_decision
  for select to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
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

create policy contract_review_decision_counsel_insert on public.contract_review_decision
  for insert to authenticated
  with check (
    not without_counsel
    and decided_by = (select auth.uid())
    and (
      (
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
    )
  );

create policy contract_review_decision_buyer_party_insert on public.contract_review_decision
  for insert to authenticated
  with check (
    without_counsel
    and side = 'buyer'
    and decided_by = (select auth.uid())
    and public.has_permission((select auth.uid()), account_id, 'deals.manage')
    and not exists (
      select 1
      from public.contract_version v
      join public.contract c on c.id = v.contract_id
      join public.deal_counsel dc on dc.deal_id = c.deal_id and dc.side = 'buyer'
      where v.id = contract_version_id
    )
  );

create policy contract_signing_override_read on public.contract_signing_override
  for select to authenticated
  using (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    or public.is_account_owner(account_id)
  );

create policy contract_signing_override_insert on public.contract_signing_override
  for insert to authenticated
  with check (
    public.has_permission((select auth.uid()), account_id, 'deals.manage')
    or public.is_account_owner(account_id)
  );

create policy contract_review_gate_default_read on public.contract_review_gate_default
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy contract_review_gate_default_insert on public.contract_review_gate_default
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_review_gate_default_update on public.contract_review_gate_default
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy deal_contract_review_gate_change_read on public.deal_contract_review_gate_change
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_contract_review_gate_change_insert on public.deal_contract_review_gate_change
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

-- ---- Team only, and locked with the team ----
-- 'members' refuses only the team's own writes; counsel and the seller write
-- as non-members.

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_review_request
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_review_decision
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_signing_override
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.contract_review_gate_default
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.deal_contract_review_gate_change
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_review_request
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_review_decision
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_signing_override
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.contract_review_gate_default
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_contract_review_gate_change
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_contract_version_id
  before insert or update on public.contract_review_request
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contract_version_id', 'contract_version');

create trigger same_team_contract_version_id
  before insert or update on public.contract_review_decision
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contract_version_id', 'contract_version');

create trigger same_team_contract_version_id
  before insert or update on public.contract_signing_override
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contract_version_id', 'contract_version');

create trigger same_team_deal_id
  before insert or update on public.deal_contract_review_gate_change
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');
