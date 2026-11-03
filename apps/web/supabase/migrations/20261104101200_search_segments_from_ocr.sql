-- Search hits say whether their text came from OCR, which adds a result
-- column.
drop function public.search_document_segments(uuid, text, boolean, int);

-- Ranked matches in one deal. Earlier versions of a file (same folder and
-- name) are left out unless asked for. ts_headline rereads the text, so it
-- runs only on the rows that make the cut.
create or replace function public.search_document_segments(
  deal_id uuid,
  query text,
  include_earlier_versions boolean default false,
  result_limit int default 10)
  returns table (
    segment_id uuid,
    dr_document_id uuid,
    document_name text,
    document_version int,
    page_from int,
    page_to int,
    sheet text,
    cell_range text,
    snippet text,
    rank real,
    from_ocr boolean)
  language sql stable security invoker
  set search_path = '' as $$
  with q as (
    select websearch_to_tsquery('english', search_document_segments.query) as q
  ),
  ranked as (
    select s.id, s.dr_document_id, d.name, s.document_version, s.page_from, s.page_to, s.sheet, s.cell_range,
           s.text, ts_rank(s.tsv, q.q) as rank, s.from_ocr
    from public.document_segment s
    join public.dr_document d on d.id = s.dr_document_id
    cross join q
    where s.deal_id = search_document_segments.deal_id
      and s.tsv @@ q.q
      and (
        search_document_segments.include_earlier_versions
        or not exists (
          select 1 from public.dr_document newer
          where newer.folder_id = d.folder_id and newer.name = d.name and newer.version > d.version
        )
      )
    order by rank desc, s.id
    limit search_document_segments.result_limit
  )
  select r.id, r.dr_document_id, r.name, r.document_version, r.page_from, r.page_to, r.sheet, r.cell_range,
         ts_headline('english', r.text, q.q), r.rank, r.from_ocr
  from ranked r
  cross join q
  order by r.rank desc, r.id;
$$;

grant execute on function public.search_document_segments(uuid, text, boolean, int) to authenticated, service_role;
