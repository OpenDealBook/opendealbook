-- Extracted text of data-room documents, one row per page, section or sheet
-- block, with the provenance a citation needs. Ingestion writes it with the
-- service role; the AI agent reads it only through the asking user's client,
-- so the read policy defers to dr_document_read and the model sees exactly the
-- documents the user can open. Removed documents vanish from reads at once and
-- purge_removed_document_text deletes their rows nightly.

create type public.document_segment_kind as enum ('page', 'section', 'sheet_block');

create table if not exists public.document_segment (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  -- No foreign key: replay_deal deletes a deal's documents and puts them back
  -- under the same ids, and the text must survive it.
  dr_document_id uuid not null,
  document_version int not null,
  segment_index int not null,
  kind public.document_segment_kind not null,
  page_from int,
  page_to int,
  sheet text,
  cell_range text,
  text text not null,
  formulas text,
  tsv tsvector not null default ''::tsvector,
  from_ocr boolean not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint document_segment_order unique (dr_document_id, segment_index),
  constraint document_segment_address check (
    case kind
      when 'sheet_block' then sheet is not null and cell_range is not null and page_from is null and page_to is null
      else sheet is null and cell_range is null and page_from is not null and page_to is not null and page_from <= page_to
    end
  )
);

alter table public.document_segment enable row level security;

create index ix_document_segment_deal on public.document_segment (deal_id);
create index ix_document_segment_tsv on public.document_segment using gin (tsv);

revoke all on public.document_segment from authenticated, service_role;
grant select on public.document_segment to authenticated;
grant select, insert, update, delete on public.document_segment to service_role;

insert into odb.billing_lock_exempt_tables (table_name, reason)
values ('document_segment', 'derived index, written by server jobs');

create trigger refuse_team_move
  before update on public.document_segment
  for each row execute function odb.refuse_team_move();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.document_segment
  for each row execute function odb.refuse_personal_account_row();

create trigger same_team_deal_id
  before insert or update on public.document_segment
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_dr_document_id
  before insert or update on public.document_segment
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'dr_document_id', 'dr_document');

create policy document_segment_read on public.document_segment
  for select to authenticated
  using (exists (select 1 from public.dr_document d where d.id = dr_document_id));

create or replace function public.document_segment_index_text()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  new.tsv := to_tsvector('english', new.text);
  return new;
end;
$$;

create trigger document_segment_index_text
  before insert or update of text on public.document_segment
  for each row execute function public.document_segment_index_text();

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

-- 32000 characters is about 8k tokens: the most one read hands the model. The
-- segment that crosses the cap is cut there and later ones are left out. Every
-- row says whether the cap cut the read, and next_page is the first page whose
-- text was cut or left out, or the page after a first page that alone passes
-- the cap, so rereading never returns the same text.
create or replace function public.read_document_pages(document_id uuid, from_page int, to_page int)
  returns table (segment_id uuid, page_from int, page_to int, text text, from_ocr boolean, truncated boolean, next_page int)
  language sql stable security invoker
  set search_path = '' as $$
  with r as (
    select s.id, s.page_from, s.page_to, s.text, s.from_ocr, s.segment_index,
           coalesce(sum(length(s.text)) over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    where s.dr_document_id = read_document_pages.document_id
      and s.page_from <= read_document_pages.to_page
      and s.page_to >= read_document_pages.from_page
  ),
  cut as (
    select (
      select case when r.preceding = 0 then r.page_to + 1 else r.page_from end
      from r
      where r.preceding + length(r.text) > 32000
      order by r.segment_index
      limit 1
    ) as next_page
  )
  select r.id, r.page_from, r.page_to, left(r.text, 32000 - r.preceding::int), r.from_ocr,
         cut.next_page is not null, cut.next_page
  from r
  cross join cut
  where r.preceding < 32000
  order by r.segment_index;
$$;

grant execute on function public.read_document_pages(uuid, int, int) to authenticated, service_role;

create or replace function public.a1_column_number(letters text)
  returns int
  language sql immutable
  set search_path = '' as $$
  select sum((ascii(substr(letters, i, 1)) - 64) * 26 ^ (length(letters) - i))::int
  from generate_series(1, length(letters)) i;
$$;

-- An A1 cell or range, in either case and with or without $ anchors, as a box
-- of column and row numbers, so overlapping ranges are boxes that share a point.
create or replace function public.a1_box(cell_range text)
  returns box
  language sql immutable
  set search_path = '' as $$
  select box(
    point(public.a1_column_number(m[1]), m[2]::int),
    point(public.a1_column_number(coalesce(m[3], m[1])), coalesce(m[4], m[2])::int))
  from regexp_match(upper(replace(cell_range, '$', '')), '^([A-Z]+)([0-9]+)(?::([A-Z]+)([0-9]+))?$') m;
$$;

grant execute on function public.a1_column_number(text) to authenticated, service_role;
grant execute on function public.a1_box(text) to authenticated, service_role;

-- Sheet blocks of one sheet that overlap the range, under the same cap as
-- read_document_pages. Formulas come back only when asked for, and then count
-- toward the cap after their block's text. Every row says whether the cap cut
-- the read.
create or replace function public.read_sheet_range(document_id uuid, sheet text, a1_range text, with_formulas boolean default false)
  returns table (segment_id uuid, cell_range text, text text, formulas text, from_ocr boolean, truncated boolean)
  language sql stable security invoker
  set search_path = '' as $$
  with r as (
    select s.id, s.cell_range, s.text, f.formulas, s.from_ocr, s.segment_index,
           length(s.text) + coalesce(length(f.formulas), 0) as size,
           coalesce(sum(length(s.text) + coalesce(length(f.formulas), 0))
             over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    cross join lateral (select case when read_sheet_range.with_formulas then s.formulas end as formulas) f
    where s.dr_document_id = read_sheet_range.document_id
      and s.sheet = read_sheet_range.sheet
      and public.a1_box(s.cell_range) operator(pg_catalog.&&) public.a1_box(read_sheet_range.a1_range)
  )
  select r.id, r.cell_range, left(r.text, 32000 - r.preceding::int),
         left(r.formulas, greatest(0, 32000 - r.preceding::int - length(r.text))), r.from_ocr,
         exists (select 1 from r cut where cut.preceding + cut.size > 32000)
  from r
  where r.preceding < 32000
  order by r.segment_index;
$$;

grant execute on function public.read_sheet_range(uuid, text, text, boolean) to authenticated, service_role;

create or replace function public.a1_column_letters(column_number int)
  returns text
  language plpgsql immutable
  set search_path = '' as $$
declare
  remaining int := column_number;
  letters text := '';
begin
  while remaining > 0 loop
    letters := chr(65 + (remaining - 1) % 26) || letters;
    remaining := (remaining - 1) / 26;
  end loop;
  return letters;
end;
$$;

grant execute on function public.a1_column_letters(int) to authenticated, service_role;

-- The latest version of each document in the deal that has extracted text,
-- with its page count or its sheets in workbook order.
create or replace function public.list_documents(deal_id uuid)
  returns table (document_id uuid, name text, version int, page_count int, sheets text[])
  language sql stable security invoker
  set search_path = '' as $$
  select d.id, d.name, d.version,
         max(s.page_to),
         array_agg(s.sheet order by s.segment_index) filter (where s.sheet is not null and s.first_of_sheet)
  from public.dr_document d
  join (
    select seg.dr_document_id, seg.page_to, seg.sheet, seg.segment_index,
           seg.segment_index = min(seg.segment_index) over (partition by seg.dr_document_id, seg.sheet) as first_of_sheet
    from public.document_segment seg
    where seg.deal_id = list_documents.deal_id
  ) s on s.dr_document_id = d.id
  where d.deal_id = list_documents.deal_id
    and not exists (
      select 1 from public.dr_document newer
      where newer.folder_id = d.folder_id and newer.name = d.name and newer.version > d.version
    )
  group by d.id, d.name, d.version
  order by d.name, d.id;
$$;

grant execute on function public.list_documents(uuid) to authenticated, service_role;

-- Each sheet of a workbook in workbook order, with the A1 range spanning
-- every cell its blocks hold.
create or replace function public.list_sheets(document_id uuid)
  returns table (sheet text, used_range text)
  language sql stable security invoker
  set search_path = '' as $$
  select b.sheet,
         public.a1_column_letters(min((b.cells[1])[0])::int) || min((b.cells[1])[1])::int
           || ':' || public.a1_column_letters(max((b.cells[0])[0])::int) || max((b.cells[0])[1])::int
  from (
    select s.sheet, s.segment_index, public.a1_box(s.cell_range) as cells
    from public.document_segment s
    where s.dr_document_id = list_sheets.document_id
      and s.kind = 'sheet_block'
  ) b
  group by b.sheet
  order by min(b.segment_index);
$$;

grant execute on function public.list_sheets(uuid) to authenticated, service_role;
