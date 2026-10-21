-- An immutable revision of a contract. version is unique within a contract.
-- Deal-scoped through the parent contract's deal; managed with deals.manage.

create table if not exists public.contract_version (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  version int not null,
  source text not null check (source in ('editor_save', 'upload', 'generated')),
  author_user_id uuid references auth.users,
  party text not null check (party in ('buyer', 'seller')),
  docx_path text,
  docx_bucket text check (docx_bucket in ('generated', 'contracts')),
  pdf_path text,
  pdf_bucket text check (pdf_bucket in ('generated', 'contracts')),
  change_summary text,
  is_signed boolean not null default false,
  content_hash text,
  signing_document_id text unique,
  signing_status text check (signing_status in ('draft', 'sent', 'completed', 'declined', 'expired')),
  -- Set when the buyer team shares this version with the seller side.
  shared_at timestamptz,
  -- The number the seller side knows this version by, fixed when they first
  -- see it so later shares never reveal what they did not see.
  seller_number int,
  created_at timestamptz not null default now(),
  unique (contract_id, version),
  unique (contract_id, seller_number),
  check ((docx_path is null) = (docx_bucket is null)),
  check ((pdf_path is null) = (pdf_bucket is null))
);

alter table public.contract_version enable row level security;

create index ix_contract_version_contract on public.contract_version (contract_id);
create index ix_contract_version_account on public.contract_version (account_id);

revoke all on public.contract_version from authenticated, service_role;
-- signing_document_id and signing_status are left out: only the contract
-- projector and the service role write what a signing webhook is matched on.
grant select, delete on public.contract_version to authenticated;
grant
  insert (id, contract_id, account_id, version, source, author_user_id, party, docx_path, docx_bucket, pdf_path, pdf_bucket, change_summary, is_signed, content_hash, created_at),
  update (id, contract_id, account_id, source, author_user_id, docx_path, docx_bucket, pdf_path, pdf_bucket, change_summary, is_signed, content_hash, shared_at, created_at)
  on public.contract_version to authenticated;
grant select, insert, update, delete on public.contract_version to service_role;

create or replace function public.keep_first_shared_at()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if old.shared_at is not null and new.shared_at is not null then
    new.shared_at := old.shared_at;
  end if;
  return new;
end;
$$;

create trigger keep_first_shared_at
  before update of shared_at on public.contract_version
  for each row execute function public.keep_first_shared_at();

-- A signed version is shown to the seller side. A version the seller side
-- sees for the first time takes the next seller number on its contract; the
-- contract row lock keeps two versions from taking the same one. Taking the
-- number is logged once, so seller's counsel are told of it.
create or replace function public.show_contract_version_to_seller_side()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_deal_id uuid;
  v_role text;
begin
  if new.is_signed and new.shared_at is null then
    new.shared_at := now();
  end if;

  if new.seller_number is null and (new.shared_at is not null or new.party = 'seller') then
    select c.deal_id into v_deal_id from public.contract c where c.id = new.contract_id for update;
    select coalesce(max(v.seller_number), 0) + 1 into new.seller_number
    from public.contract_version v
    where v.contract_id = new.contract_id;

    -- Whoever shows the version, the log entry is the service's; the caller's
    -- role is put back so nothing after this runs as the service.
    v_role := current_setting('request.jwt.claim.role', true);
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform public.append_deal_event(v_deal_id, 'contract', new.contract_id,
      'contract.version_shown_to_seller_side', jsonb_build_object('version_id', new.id),
      null, 'service', 'contract_version');
    perform set_config('request.jwt.claim.role', coalesce(v_role, ''), true);
  end if;

  return new;
end;
$$;

create trigger show_contract_version_to_seller_side
  before insert or update on public.contract_version
  for each row execute function public.show_contract_version_to_seller_side();

create policy contract_version_read on public.contract_version
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    or public.has_deal_permission(
      (select c.deal_id from public.contract c where c.id = contract_id),
      'deals.manage'
    )
  );

create policy contract_version_insert on public.contract_version
  for insert to authenticated
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_version_update on public.contract_version
  for update to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'))
  with check (public.has_permission((select auth.uid()), account_id, 'deals.manage'));

create policy contract_version_delete on public.contract_version
  for delete to authenticated
  using (public.has_permission((select auth.uid()), account_id, 'deals.manage'));
