-- AI drafts of the team's replies to lender asks. A draft may only use what
-- the ask's room shows, so the room reads below mirror the deal's document
-- reads (99zz1) row for row, limited to what the room shows.

create or replace function public.list_room_documents(room_id uuid)
  returns table (document_id uuid, name text, version int, page_count int, sheets text[])
  language sql stable security definer
  set search_path = '' as $$
  select d.id, d.name, d.version,
         max(s.page_to),
         array_agg(s.sheet order by s.segment_index) filter (where s.sheet is not null and s.first_of_sheet)
  from public.lender_room r
  join public.dr_document d on d.deal_id = r.deal_id
  join (
    select seg.dr_document_id, seg.page_to, seg.sheet, seg.segment_index,
           seg.segment_index = min(seg.segment_index) over (partition by seg.dr_document_id, seg.sheet) as first_of_sheet
    from public.document_segment seg
  ) s on s.dr_document_id = d.id
  where r.id = list_room_documents.room_id
    and public.can_work_lender_room(r.id)
    and public.lender_room_shows_document_unchecked(r.id, d.id)
    and not exists (
      select 1 from public.dr_document newer
      where newer.folder_id = d.folder_id and newer.name = d.name and newer.version > d.version
        and public.lender_room_shows_document_unchecked(r.id, newer.id)
    )
  group by d.id, d.name, d.version
  order by d.name, d.id;
$$;

revoke all on function public.list_room_documents(uuid) from public, anon, service_role;
grant execute on function public.list_room_documents(uuid) to authenticated;

create or replace function public.list_room_sheets(room_id uuid, document_id uuid)
  returns table (sheet text, used_range text)
  language sql stable security definer
  set search_path = '' as $$
  select b.sheet,
         public.a1_column_letters(min((b.cells[1])[0])::int) || min((b.cells[1])[1])::int
           || ':' || public.a1_column_letters(max((b.cells[0])[0])::int) || max((b.cells[0])[1])::int
  from (
    select s.sheet, s.segment_index, public.a1_box(s.cell_range) as cells
    from public.document_segment s
    where s.dr_document_id = list_room_sheets.document_id
      and s.kind = 'sheet_block'
      and public.can_work_lender_room(list_room_sheets.room_id)
      and public.lender_room_shows_document_unchecked(list_room_sheets.room_id, list_room_sheets.document_id)
  ) b
  group by b.sheet
  order by min(b.segment_index);
$$;

revoke all on function public.list_room_sheets(uuid, uuid) from public, anon, service_role;
grant execute on function public.list_room_sheets(uuid, uuid) to authenticated;

create or replace function public.search_room_segments(
  room_id uuid,
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
  language sql stable security definer
  set search_path = '' as $$
  with q as (
    select websearch_to_tsquery('english', search_room_segments.query) as q
  ),
  ranked as (
    select s.id, s.dr_document_id, d.name, s.document_version, s.page_from, s.page_to, s.sheet, s.cell_range,
           s.text, ts_rank(s.tsv, q.q) as rank, s.from_ocr
    from public.lender_room r
    join public.document_segment s on s.deal_id = r.deal_id
    join public.dr_document d on d.id = s.dr_document_id
    cross join q
    where r.id = search_room_segments.room_id
      and public.can_work_lender_room(r.id)
      and s.tsv @@ q.q
      and public.lender_room_shows_document_unchecked(r.id, d.id)
      and (
        search_room_segments.include_earlier_versions
        or not exists (
          select 1 from public.dr_document newer
          where newer.folder_id = d.folder_id and newer.name = d.name and newer.version > d.version
            and public.lender_room_shows_document_unchecked(r.id, newer.id)
        )
      )
    order by rank desc, s.id
    limit search_room_segments.result_limit
  )
  select r.id, r.dr_document_id, r.name, r.document_version, r.page_from, r.page_to, r.sheet, r.cell_range,
         ts_headline('english', r.text, q.q), r.rank, r.from_ocr
  from ranked r
  cross join q
  order by r.rank desc, r.id;
$$;

revoke all on function public.search_room_segments(uuid, text, boolean, int) from public, anon, service_role;
grant execute on function public.search_room_segments(uuid, text, boolean, int) to authenticated;

create or replace function public.read_room_document_pages(room_id uuid, document_id uuid, from_page int, to_page int)
  returns table (segment_id uuid, page_from int, page_to int, text text, from_ocr boolean, truncated boolean, next_page int)
  language sql stable security definer
  set search_path = '' as $$
  with r as (
    select s.id, s.page_from, s.page_to, s.text, s.from_ocr, s.segment_index,
           coalesce(sum(length(s.text)) over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    where s.dr_document_id = read_room_document_pages.document_id
      and s.page_from <= read_room_document_pages.to_page
      and s.page_to >= read_room_document_pages.from_page
      and public.can_work_lender_room(read_room_document_pages.room_id)
      and public.lender_room_shows_document_unchecked(read_room_document_pages.room_id, read_room_document_pages.document_id)
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

revoke all on function public.read_room_document_pages(uuid, uuid, int, int) from public, anon, service_role;
grant execute on function public.read_room_document_pages(uuid, uuid, int, int) to authenticated;

-- The room tools never ask for formulas, so formulas always come back null.
create or replace function public.read_room_sheet_range(room_id uuid, document_id uuid, sheet text, a1_range text)
  returns table (segment_id uuid, cell_range text, text text, formulas text, from_ocr boolean, truncated boolean)
  language sql stable security definer
  set search_path = '' as $$
  with r as (
    select s.id, s.cell_range, s.text, s.from_ocr, s.segment_index,
           length(s.text) as size,
           coalesce(sum(length(s.text)) over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    where s.dr_document_id = read_room_sheet_range.document_id
      and s.sheet = read_room_sheet_range.sheet
      and public.a1_box(s.cell_range) operator(pg_catalog.&&) public.a1_box(read_room_sheet_range.a1_range)
      and public.can_work_lender_room(read_room_sheet_range.room_id)
      and public.lender_room_shows_document_unchecked(read_room_sheet_range.room_id, read_room_sheet_range.document_id)
  )
  select r.id, r.cell_range, left(r.text, 32000 - r.preceding::int), null::text, r.from_ocr,
         exists (select 1 from r cut where cut.preceding + cut.size > 32000)
  from r
  where r.preceding < 32000
  order by r.segment_index;
$$;

revoke all on function public.read_room_sheet_range(uuid, uuid, text, text) from public, anon, service_role;
grant execute on function public.read_room_sheet_range(uuid, uuid, text, text) to authenticated;

-- The web route finishes a draft with the service role; after that a person
-- may only mark a ready draft used or discarded.
create type public.lender_ask_ai_draft_status as enum ('running', 'ready', 'credits_ran_out', 'failed', 'used', 'discarded');

create table if not exists public.lender_ask_ai_draft (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references public.lender_ask (id) on delete cascade,
  room_id uuid not null,
  account_id uuid not null,
  deal_id uuid not null,
  requested_by uuid default auth.uid() references auth.users on delete set null,
  status public.lender_ask_ai_draft_status not null default 'running',
  body text,
  citations jsonb not null default '[]'::jsonb constraint lender_ask_ai_draft_citations_list check (jsonb_typeof(citations) = 'array'),
  suggested_document_ids uuid[] not null default '{}',
  model text,
  credits_used numeric(12,4) not null default 0,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (room_id, account_id) references public.lender_room (id, account_id) on delete cascade,
  foreign key (room_id, deal_id) references public.lender_room (id, deal_id) on delete cascade,
  constraint lender_ask_ai_draft_finished check ((status = 'running') = (finished_at is null))
);

create index ix_lender_ask_ai_draft_ask_created on public.lender_ask_ai_draft (ask_id, created_at);
create unique index ux_lender_ask_ai_draft_one_running on public.lender_ask_ai_draft (requested_by, ask_id) where status = 'running';

alter table public.lender_ask_ai_draft enable row level security;

revoke all on public.lender_ask_ai_draft from anon, authenticated, service_role;
grant select on public.lender_ask_ai_draft to authenticated;
grant insert (id, ask_id) on public.lender_ask_ai_draft to authenticated;
grant select on public.lender_ask_ai_draft to service_role;
grant update (status, body, citations, suggested_document_ids, model, credits_used, steps, finished_at)
  on public.lender_ask_ai_draft to service_role;

create policy lender_ask_ai_draft_read on public.lender_ask_ai_draft
  for select to authenticated
  using (public.can_work_lender_room(room_id));

create policy lender_ask_ai_draft_insert on public.lender_ask_ai_draft
  for insert to authenticated
  with check (public.can_work_lender_room(room_id));

-- Named to fire before the other insert triggers, which read the scope it sets.
create or replace function odb.derive_lender_ask_ai_draft_scope()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_kind public.lender_ask_kind;
begin
  select a.kind, a.room_id, a.account_id, r.deal_id
  into v_kind, new.room_id, new.account_id, new.deal_id
  from public.lender_ask a
  join public.lender_room r on r.id = a.room_id
  where a.id = new.ask_id;
  if not public.can_work_lender_room(new.room_id) then
    raise exception 'only someone who can reply in the room drafts for its asks' using errcode = 'insufficient_privilege';
  end if;
  if v_kind = 'form' then
    raise exception 'a form ask gets no draft' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger derive_scope
  before insert on public.lender_ask_ai_draft
  for each row execute function odb.derive_lender_ask_ai_draft_scope();

-- A draft still running 10 minutes after it started belongs to a crashed
-- request; it fails when its requester, or anyone once its requester is gone,
-- starts another draft for the same ask.
create or replace function odb.fail_stale_lender_ask_ai_drafts()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.lender_ask_ai_draft
  set status = 'failed', finished_at = now()
  where ask_id = new.ask_id
    and (requested_by = new.requested_by or requested_by is null)
    and status = 'running'
    and created_at < now() - interval '10 minutes';
  return new;
end;
$$;

create trigger fail_stale_lender_ask_ai_drafts
  before insert on public.lender_ask_ai_draft
  for each row execute function odb.fail_stale_lender_ask_ai_drafts();

create or replace function public.start_lender_ask_ai_draft(p_ask_id uuid)
  returns uuid
  language sql security invoker
  set search_path = '' as $$
  insert into public.lender_ask_ai_draft (ask_id) values (p_ask_id) returning id;
$$;

revoke all on function public.start_lender_ask_ai_draft(uuid) from public, anon, service_role;
grant execute on function public.start_lender_ask_ai_draft(uuid) to authenticated;

create or replace function public.mark_lender_ask_ai_draft(p_draft_id uuid, p_status public.lender_ask_ai_draft_status)
  returns void
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_draft public.lender_ask_ai_draft;
begin
  select * into v_draft from public.lender_ask_ai_draft where id = p_draft_id for update;
  if not public.can_work_lender_room(v_draft.room_id) then
    raise exception 'only someone who can reply in the room marks its drafts' using errcode = 'insufficient_privilege';
  end if;
  if v_draft.status <> 'ready' or p_status not in ('used', 'discarded') then
    raise exception 'only a ready draft is marked, and only used or discarded' using errcode = 'check_violation';
  end if;
  update public.lender_ask_ai_draft set status = p_status where id = p_draft_id;
end;
$$;

revoke all on function public.mark_lender_ask_ai_draft(uuid, public.lender_ask_ai_draft_status) from public, anon, service_role;
grant execute on function public.mark_lender_ask_ai_draft(uuid, public.lender_ask_ai_draft_status) to authenticated;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lender_ask_ai_draft
  for each row execute function odb.refuse_write_when_team_locked('members', 'ask_id', 'lender_ask');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lender_ask_ai_draft
  for each row execute function odb.refuse_personal_account_row();

alter table public.ai_call_log
  add column lender_ask_ai_draft_id uuid references public.lender_ask_ai_draft (id) on delete set null;

create index ix_ai_call_log_lender_ask_ai_draft on public.ai_call_log (lender_ask_ai_draft_id);

create trigger same_team_lender_ask_ai_draft_id
  before insert or update on public.ai_call_log
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'lender_ask_ai_draft_id', 'lender_ask_ai_draft');
