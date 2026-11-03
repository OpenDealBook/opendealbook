-- Saved AI questions about a deal, in threads of follow-ups. The whole deal
-- team reads them; the web route writes a question as its asker, who alone
-- finishes it while it runs and may later delete it. A thread holds up to 20
-- questions, and a person runs one question at a time.

create type public.deal_ai_question_status as enum ('running', 'answered', 'credits_ran_out', 'failed');

create table if not exists public.deal_ai_thread (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deal (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, deal_id)
);

create index ix_deal_ai_thread_deal on public.deal_ai_thread (deal_id);

alter table public.deal_ai_thread enable row level security;

revoke all on public.deal_ai_thread from anon, authenticated, service_role;
grant select on public.deal_ai_thread to authenticated;
grant insert (id, deal_id) on public.deal_ai_thread to authenticated;
grant select, insert, update, delete on public.deal_ai_thread to service_role;

create policy deal_ai_thread_read on public.deal_ai_thread
  for select to authenticated
  using (public.has_deal_permission(deal_id, 'deals.work'));

create policy deal_ai_thread_insert on public.deal_ai_thread
  for insert to authenticated
  with check (public.has_deal_permission(deal_id, 'deals.work'));

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_ai_thread
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create table if not exists public.deal_ai_question (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  deal_id uuid not null references public.deal (id) on delete cascade,
  asked_by uuid default auth.uid() references auth.users on delete set null,
  question text not null,
  answer text,
  status public.deal_ai_question_status not null default 'running',
  model text,
  credits_used numeric(12,4) not null default 0,
  steps jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (thread_id, deal_id) references public.deal_ai_thread (id, deal_id) on delete cascade,
  constraint deal_ai_question_finished check ((status = 'running') = (finished_at is null))
);

create index ix_deal_ai_question_thread on public.deal_ai_question (thread_id);
create index ix_deal_ai_question_deal on public.deal_ai_question (deal_id);
create unique index ux_deal_ai_question_one_running on public.deal_ai_question (asked_by) where status = 'running';

alter table public.deal_ai_question enable row level security;

revoke all on public.deal_ai_question from anon, authenticated, service_role;
grant select, delete on public.deal_ai_question to authenticated;
grant insert (id, thread_id, deal_id, question) on public.deal_ai_question to authenticated;
grant update (answer, status, model, credits_used, steps, citations, finished_at) on public.deal_ai_question to authenticated;
grant select, insert, update, delete on public.deal_ai_question to service_role;

create policy deal_ai_question_read on public.deal_ai_question
  for select to authenticated
  using (public.has_deal_permission(deal_id, 'deals.work'));

create policy deal_ai_question_insert on public.deal_ai_question
  for insert to authenticated
  with check (asked_by = (select auth.uid()) and public.has_deal_permission(deal_id, 'deals.work'));

create policy deal_ai_question_finish on public.deal_ai_question
  for update to authenticated
  using (asked_by = (select auth.uid()) and status = 'running')
  with check (asked_by = (select auth.uid()) and public.has_deal_permission(deal_id, 'deals.work'));

create policy deal_ai_question_delete on public.deal_ai_question
  for delete to authenticated
  using (asked_by = (select auth.uid()));

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_ai_question
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

-- Locks the thread so two questions asked at once cannot both take the last
-- place.
create or replace function odb.refuse_full_deal_ai_thread()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  perform 1 from public.deal_ai_thread where id = new.thread_id for update;
  if (select count(*) from public.deal_ai_question where thread_id = new.thread_id) >= 20 then
    raise exception 'a thread holds at most 20 questions' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger refuse_full_deal_ai_thread
  before insert on public.deal_ai_question
  for each row execute function odb.refuse_full_deal_ai_thread();

alter table public.ai_call_log
  add column question_id uuid references public.deal_ai_question (id) on delete set null;

create index ix_ai_call_log_question on public.ai_call_log (question_id);

-- Page and sheet reads now say when the 32000 character cap cut them, which
-- changes their result columns.
drop function public.read_document_pages(uuid, int, int);
drop function public.read_sheet_range(uuid, text, text, boolean);

-- 32000 characters is about 8k tokens: the most one read hands the model. The
-- segment that crosses the cap is cut there and later ones are left out. Every
-- row says whether the cap cut the read, and next_page is the first page whose
-- text was cut or left out.
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
    select (select r.page_from from r where r.preceding + length(r.text) > 32000 order by r.segment_index limit 1) as next_page
  )
  select r.id, r.page_from, r.page_to, left(r.text, 32000 - r.preceding::int), r.from_ocr,
         cut.next_page is not null, cut.next_page
  from r
  cross join cut
  where r.preceding < 32000
  order by r.segment_index;
$$;

grant execute on function public.read_document_pages(uuid, int, int) to authenticated, service_role;

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
