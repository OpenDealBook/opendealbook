-- Citations follow their row, cite a whole document when the file has no
-- pages or sheets, keep a snapshot of the document they were made against,
-- and name why a change to them is refused.

alter table public.calc_input_citation
  add column if not exists row_id uuid,
  add column if not exists document_name text,
  add column if not exists document_version int;

update public.calc_input_citation c
set document_name = d.name, document_version = d.version
from public.dr_document d
where d.id = c.dr_document_id;

alter table public.calc_input_citation
  alter column document_name set not null,
  alter column document_version set not null,
  drop constraint calc_input_citation_check,
  add constraint calc_input_citation_check check (num_nonnulls(page, sheet) <= 1);

create index if not exists ix_calc_input_citation_row on public.calc_input_citation (row_id);

create or replace function public.check_calc_input_citation()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  document public.dr_document;
  earlier public.calc_input_citation;
begin
  select d.* into document
  from public.dr_document d
  join public.calc_version v on v.deal_id = d.deal_id
  where d.id = new.dr_document_id and v.id = new.calc_version_id;

  if document.id is not null then
    new.document_name := document.name;
    new.document_version := document.version;
  else
    select c.* into earlier
    from public.calc_input_citation c
    join public.calc_version cv on cv.id = c.calc_version_id
    join public.calc_version v on v.deal_id = cv.deal_id
    where c.dr_document_id = new.dr_document_id and v.id = new.calc_version_id
      and c.id is distinct from new.id
    limit 1;

    if earlier.id is null then
      raise exception 'A calc cites only documents in its own deal''s data room'
        using errcode = 'foreign_key_violation';
    end if;

    new.document_name := earlier.document_name;
    new.document_version := earlier.document_version;
  end if;

  if public.is_seller_counsel_document(new.dr_document_id) then
    raise exception 'Seller''s counsel files cannot be cited'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop function if exists public.calc_input_citations(uuid);

create function public.calc_input_citations(calc_version_id uuid)
  returns table (
    id uuid,
    row_id uuid,
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
  select c.id, c.row_id, c.input_key, c.dr_document_id, c.document_name, c.document_version,
    c.page, c.sheet, c.cell,
    coalesce(exists (
      select 1 from public.dr_document n
      where n.deal_id = d.deal_id
        and n.folder_id = d.folder_id
        and n.name = d.name
        and n.version > d.version
        and n.removed_at is null
    ), false),
    d.id is null or d.removed_at is not null
  from public.calc_input_citation c
  left join public.dr_document d on d.id = c.dr_document_id
  where c.calc_version_id = calc_input_citations.calc_version_id
    and public.has_role_on_account(c.account_id)
    and not public.is_seller_counsel_document(c.dr_document_id)
  order by c.created_at, c.id;
$$;

revoke all on function public.calc_input_citations(uuid) from public, anon;
grant execute on function public.calc_input_citations(uuid) to authenticated, service_role;

create or replace function public.calc_citation_refusal(calc_version_id uuid)
  returns text
  language sql stable security definer
  set search_path = '' as $$
  select case
    when public.can_edit_calc_version(v.id) then null
    when not public.has_role_on_account(v.account_id) then 'outsider'
    when not public.has_permission((select auth.uid()), v.account_id, 'deals.work') then 'read_only'
    else 'not_yours'
  end
  from public.calc_version v
  where v.id = calc_citation_refusal.calc_version_id;
$$;

revoke all on function public.calc_citation_refusal(uuid) from public, anon;
grant execute on function public.calc_citation_refusal(uuid) to authenticated, service_role;

create or replace function public.remove_row_citations()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.calc_input_citation where row_id = old.id;
  return old;
end;
$$;

create trigger calc_input_citations_removed
  after delete on public.sde_period
  for each row execute function public.remove_row_citations();

create trigger calc_input_citations_removed
  after delete on public.sde_line
  for each row execute function public.remove_row_citations();

create trigger calc_input_citations_removed
  after delete on public.funding_source
  for each row execute function public.remove_row_citations();
