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
    rank real)
  language sql stable security invoker
  set search_path = '' as $$
  with q as (
    select websearch_to_tsquery('english', search_document_segments.query) as q
  ),
  ranked as (
    select s.id, s.dr_document_id, d.name, s.document_version, s.page_from, s.page_to, s.sheet, s.cell_range,
           s.text, ts_rank(s.tsv, q.q) as rank
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
         ts_headline('english', r.text, q.q), r.rank
  from ranked r
  cross join q
  order by r.rank desc, r.id;
$$;

grant execute on function public.search_document_segments(uuid, text, boolean, int) to authenticated, service_role;

-- 32000 characters is about 8k tokens: the most one read hands the model. The
-- segment that crosses the cap is cut there and later ones are left out.
create or replace function public.read_document_pages(document_id uuid, from_page int, to_page int)
  returns table (segment_id uuid, page_from int, page_to int, text text, from_ocr boolean)
  language sql stable security invoker
  set search_path = '' as $$
  select r.id, r.page_from, r.page_to, left(r.text, 32000 - r.preceding::int), r.from_ocr
  from (
    select s.id, s.page_from, s.page_to, s.text, s.from_ocr, s.segment_index,
           coalesce(sum(length(s.text)) over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    where s.dr_document_id = read_document_pages.document_id
      and s.page_from <= read_document_pages.to_page
      and s.page_to >= read_document_pages.from_page
  ) r
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

-- An A1 cell or range as a box of column and row numbers, so overlapping
-- ranges are boxes that share a point.
create or replace function public.a1_box(cell_range text)
  returns box
  language sql immutable
  set search_path = '' as $$
  select box(
    point(public.a1_column_number(m[1]), m[2]::int),
    point(public.a1_column_number(coalesce(m[3], m[1])), coalesce(m[4], m[2])::int))
  from regexp_match(cell_range, '^([A-Z]+)([0-9]+)(?::([A-Z]+)([0-9]+))?$') m;
$$;

grant execute on function public.a1_column_number(text) to authenticated, service_role;
grant execute on function public.a1_box(text) to authenticated, service_role;

-- Sheet blocks of one sheet that overlap the range, under the same cap as
-- read_document_pages.
create or replace function public.read_sheet_range(document_id uuid, sheet text, a1_range text)
  returns table (segment_id uuid, cell_range text, text text, from_ocr boolean)
  language sql stable security invoker
  set search_path = '' as $$
  select r.id, r.cell_range, left(r.text, 32000 - r.preceding::int), r.from_ocr
  from (
    select s.id, s.cell_range, s.text, s.from_ocr, s.segment_index,
           coalesce(sum(length(s.text)) over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    where s.dr_document_id = read_sheet_range.document_id
      and s.sheet = read_sheet_range.sheet
      and public.a1_box(s.cell_range) operator(pg_catalog.&&) public.a1_box(read_sheet_range.a1_range)
  ) r
  where r.preceding < 32000
  order by r.segment_index;
$$;

grant execute on function public.read_sheet_range(uuid, text, text) to authenticated, service_role;

create or replace function public.purge_removed_document_text()
  returns void
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.document_chunk c
  where not exists (
    select 1 from public.dr_document d
    where d.id = c.document_id and d.removed_at is null
  );

  delete from public.embedding_job j
  where not exists (
    select 1 from public.dr_document d
    where d.id = j.dr_document_id and d.removed_at is null
  );

  delete from public.document_segment s
  where not exists (
    select 1 from public.dr_document d
    where d.id = s.dr_document_id and d.removed_at is null
  );
end;
$$;
