-- Seller's counsel files are refused exactly as unknown ids are.

-- A citation names a document of its own deal, or one already cited in its
-- deal that has since been deleted; the snapshot always comes from there.
-- A Seller's counsel file is refused exactly as an unknown id is, so the
-- refusal never tells which ids are counsel files.
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
  where d.id = new.dr_document_id and v.id = new.calc_version_id
    and not public.is_seller_counsel_document(d.id);

  if document.id is not null then
    new.document_name := document.name;
    new.document_version := document.version;
    return new;
  end if;

  select c.* into earlier
  from public.calc_input_citation c
  join public.calc_version cv on cv.id = c.calc_version_id
  join public.calc_version v on v.deal_id = cv.deal_id
  where c.dr_document_id = new.dr_document_id and v.id = new.calc_version_id
    and c.id is distinct from new.id
  limit 1;

  if earlier.id is null then
    raise exception 'A calc cites only documents in its own deal'
      using errcode = 'foreign_key_violation';
  end if;

  new.document_name := earlier.document_name;
  new.document_version := earlier.document_version;
  return new;
end;
$$;

create or replace function public.calc_input_citations(calc_version_id uuid)
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
    exists (
      select 1 from public.dr_document n
      where n.deal_id = d.deal_id
        and n.folder_id = d.folder_id
        and n.name = d.name
        and n.version > d.version
        and n.removed_at is null
    ),
    d.id is null or d.removed_at is not null
  from public.calc_input_citation c
  left join public.dr_document d on d.id = c.dr_document_id
  where c.calc_version_id = calc_input_citations.calc_version_id
    and public.has_role_on_account(c.account_id)
    and not public.is_seller_counsel_document(c.dr_document_id)
  order by c.created_at, c.id;
$$;

