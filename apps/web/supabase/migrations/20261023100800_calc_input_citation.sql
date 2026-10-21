-- Where a calc input's figure came from: a data room document version, pinned
-- by its id, and a page (PDF, Word) or sheet (Excel) with an optional cell.
-- The team reads them as it reads the calc; whoever may edit the calc version
-- adds and removes them. Seller's counsel files are never cited.

create table if not exists public.calc_input_citation (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  calc_version_id uuid not null references public.calc_version (id) on delete cascade,
  input_key text not null,
  -- No foreign key: replay_deal deletes a deal's documents and puts them back
  -- under the same ids.
  dr_document_id uuid not null,
  page int check (page >= 1),
  sheet text check (btrim(sheet) <> ''),
  cell text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(page, sheet) = 1)
);

create index if not exists ix_calc_input_citation_version on public.calc_input_citation (calc_version_id);

alter table public.calc_input_citation enable row level security;

revoke all on public.calc_input_citation from anon, authenticated, service_role;
grant select, insert, delete on public.calc_input_citation to authenticated;
grant select, insert, update, delete on public.calc_input_citation to service_role;

-- Deal managers edit every calc version; deal workers only their own scratch
-- ones, never the primary or the adopted one.
create or replace function public.can_edit_calc_version(calc_version_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select exists (
    select 1 from public.calc_version v
    where v.id = can_edit_calc_version.calc_version_id
      and (
        public.has_permission((select auth.uid()), v.account_id, 'deals.manage')
        or (
          public.has_permission((select auth.uid()), v.account_id, 'deals.work')
          and v.created_by = (select auth.uid())
          and not v.is_primary
          and not exists (
            select 1 from public.deal_financials f where f.source_calc_version_id = v.id
          )
        )
      )
  );
$$;

revoke all on function public.can_edit_calc_version(uuid) from public, anon;
grant execute on function public.can_edit_calc_version(uuid) to authenticated, service_role;

create policy calc_input_citation_read on public.calc_input_citation
  for select to authenticated
  using (
    public.has_role_on_account(account_id)
    and not public.is_seller_counsel_document(dr_document_id)
  );

create policy calc_input_citation_insert on public.calc_input_citation
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_edit_calc_version(calc_version_id)
  );

create policy calc_input_citation_delete on public.calc_input_citation
  for delete to authenticated
  using (public.can_edit_calc_version(calc_version_id));

create or replace function public.check_calc_input_citation()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if not exists (
    select 1 from public.dr_document d
    join public.calc_version v on v.deal_id = d.deal_id
    where d.id = new.dr_document_id and v.id = new.calc_version_id
  ) then
    raise exception 'A calc cites only documents in its own deal''s data room'
      using errcode = 'foreign_key_violation';
  end if;

  if public.is_seller_counsel_document(new.dr_document_id) then
    raise exception 'Seller''s counsel files cannot be cited'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger calc_input_citation_checked
  before insert or update on public.calc_input_citation
  for each row execute function public.check_calc_input_citation();

-- The pinned version reads back with whether a newer upload of the same file
-- has landed beside it and whether it was removed.
create or replace function public.calc_input_citations(calc_version_id uuid)
  returns table (
    id uuid,
    input_key text,
    dr_document_id uuid,
    document_name text,
    document_version int,
    page int,
    sheet text,
    cell text,
    newer_version_uploaded boolean,
    document_removed boolean
  )
  language sql stable security definer
  set search_path = '' as $$
  select c.id, c.input_key, c.dr_document_id, d.name, d.version, c.page, c.sheet, c.cell,
    exists (
      select 1 from public.dr_document n
      where n.deal_id = d.deal_id
        and n.folder_id = d.folder_id
        and n.name = d.name
        and n.version > d.version
        and n.removed_at is null
    ),
    d.removed_at is not null
  from public.calc_input_citation c
  join public.dr_document d on d.id = c.dr_document_id
  where c.calc_version_id = calc_input_citations.calc_version_id
    and public.has_role_on_account(c.account_id)
    and not public.is_seller_counsel_document(c.dr_document_id)
  order by c.created_at, c.id;
$$;

revoke all on function public.calc_input_citations(uuid) from public, anon;
grant execute on function public.calc_input_citations(uuid) to authenticated, service_role;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.calc_input_citation
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_calc_version_id
  before insert or update on public.calc_input_citation
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'calc_version_id', 'calc_version');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.calc_input_citation
  for each row execute function tuckin.refuse_personal_account_row();
