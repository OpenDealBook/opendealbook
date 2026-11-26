alter table public.deal_ai_question
  add column parts jsonb not null default '[]'::jsonb constraint deal_ai_question_parts_list check (jsonb_typeof(parts) = 'array'),
  add column parts_text text not null default '';

alter table public.deal_ai_question
  alter column tsv set expression as (to_tsvector('english', question || ' ' || coalesce(answer, '') || ' ' || parts_text));

alter table public.deal_ai_question
  add constraint deal_ai_question_citations_list check (jsonb_typeof(citations) = 'array');

drop function public.search_deal_ai_answers(uuid, text, int);

-- Answered questions on the deal that match the query, best match first and
-- newest first among equals. Running, failed and out-of-credits questions are
-- left out.
create or replace function public.search_deal_ai_answers(p_deal_id uuid, p_query text, p_limit int default 5)
  returns table (question_id uuid, thread_id uuid, question text, answer text, parts jsonb, citations jsonb, asked_at timestamptz, rank real)
  language sql stable security invoker
  set search_path = '' as $$
  select q.id, q.thread_id, q.question, q.answer, q.parts, q.citations, q.created_at, ts_rank(q.tsv, query.q)
  from public.deal_ai_question q
  cross join websearch_to_tsquery('english', p_query) as query(q)
  where q.deal_id = p_deal_id
    and q.status = 'answered'
    and q.tsv @@ query.q
  order by 8 desc, q.created_at desc, q.id
  limit p_limit;
$$;

revoke all on function public.search_deal_ai_answers(uuid, text, int) from public, anon, service_role;
grant execute on function public.search_deal_ai_answers(uuid, text, int) to authenticated;

-- Marks each citation saved before citations said whether their text came
-- from a scan: from scan when any text segment of the answer's deal that it
-- covers came from OCR, as a read marks it. Text no longer stored counts as
-- not from scan. Answers already fully marked are left as they are.
create or replace function odb.mark_citations_from_scan()
  returns void
  language sql
  set search_path = '' as $$
  update public.deal_ai_question q
  set citations = (
    select jsonb_agg(
      case when e.c ? 'fromOcr' then e.c
      else e.c || jsonb_build_object('fromOcr', exists (
        select 1 from public.document_segment s
        where s.deal_id = q.deal_id
          and s.dr_document_id = (e.c ->> 'documentId')::uuid
          and s.document_version = (e.c ->> 'version')::int
          and s.from_ocr
          and case when e.c ? 'sheet'
            then s.sheet = e.c ->> 'sheet'
              and public.a1_box(s.cell_range) operator(pg_catalog.&&) public.a1_box(e.c ->> 'cellRange')
            else s.page_from <= (e.c ->> 'pageTo')::int and s.page_to >= (e.c ->> 'pageFrom')::int
          end))
      end
      order by e.n)
    from jsonb_array_elements(q.citations) with ordinality as e(c, n))
  where exists (select 1 from jsonb_array_elements(q.citations) as e(c) where not e.c ? 'fromOcr');
$$;

revoke all on function odb.mark_citations_from_scan() from public;

select odb.mark_citations_from_scan();

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

-- AI checks of a seller's answer against the data room, for the buyer team
-- only: never the seller, never a lender. Someone who works the deal starts a
-- check by naming the seller message; its question, room, team and deal come
-- from the message. The web route finishes it with the service role. An
-- answer may be checked again, so one message can have several checks.

create type public.seller_answer_check_status as enum ('running', 'checked', 'credits_ran_out', 'failed');
create type public.seller_answer_check_overall as enum ('consistent', 'contradicted', 'unsupported', 'no_evidence', 'no_claims');

create table if not exists public.seller_answer_check (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.seller_room_question (id) on delete cascade,
  message_id uuid not null references public.seller_room_question_message (id) on delete cascade,
  room_id uuid not null,
  account_id uuid not null,
  deal_id uuid not null,
  requested_by uuid default auth.uid() references auth.users on delete set null,
  status public.seller_answer_check_status not null default 'running',
  overall public.seller_answer_check_overall,
  findings jsonb not null default '[]'::jsonb constraint seller_answer_check_findings_list check (jsonb_typeof(findings) = 'array'),
  follow_up text,
  model text,
  credits_used numeric(12,4) not null default 0,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (room_id, account_id) references public.seller_room (id, account_id) on delete cascade,
  foreign key (room_id, deal_id) references public.seller_room (id, deal_id) on delete cascade,
  constraint seller_answer_check_finished check ((status = 'running') = (finished_at is null)),
  constraint seller_answer_check_overall_when_checked check ((status = 'checked') = (overall is not null))
);

create index ix_seller_answer_check_question_created on public.seller_answer_check (question_id, created_at);
create index ix_seller_answer_check_message on public.seller_answer_check (message_id);
create unique index ux_seller_answer_check_one_running on public.seller_answer_check (requested_by, message_id) where status = 'running';

alter table public.seller_answer_check enable row level security;

revoke all on public.seller_answer_check from anon, authenticated, service_role;
grant select on public.seller_answer_check to authenticated;
grant insert (id, message_id) on public.seller_answer_check to authenticated;
grant select on public.seller_answer_check to service_role;
grant update (status, overall, findings, follow_up, model, credits_used, steps, finished_at)
  on public.seller_answer_check to service_role;

create policy seller_answer_check_read on public.seller_answer_check
  for select to authenticated
  using (public.has_deal_permission(deal_id, 'deals.work'));

create policy seller_answer_check_insert on public.seller_answer_check
  for insert to authenticated
  with check (public.has_deal_permission(deal_id, 'deals.work'));

-- Named to fire before the other insert triggers, which read the scope it sets.
create or replace function odb.derive_seller_answer_check_scope()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_side public.seller_side;
begin
  select m.side, m.question_id, q.room_id, q.account_id, r.deal_id
  into v_side, new.question_id, new.room_id, new.account_id, new.deal_id
  from public.seller_room_question_message m
  join public.seller_room_question q on q.id = m.question_id
  join public.seller_room r on r.id = q.room_id
  where m.id = new.message_id;
  if not public.has_deal_permission(new.deal_id, 'deals.work') then
    raise exception 'only someone who works the deal checks its answers' using errcode = 'insufficient_privilege';
  end if;
  if v_side <> 'seller' then
    raise exception 'only a seller''s message is checked' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger derive_scope
  before insert on public.seller_answer_check
  for each row execute function odb.derive_seller_answer_check_scope();

-- A check still running 10 minutes after it started belongs to a crashed
-- request; it fails when its requester, or anyone once its requester is gone,
-- starts another check of the same message.
create or replace function odb.fail_stale_seller_answer_checks()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.seller_answer_check
  set status = 'failed', finished_at = now()
  where message_id = new.message_id
    and (requested_by = new.requested_by or requested_by is null)
    and status = 'running'
    and created_at < now() - interval '10 minutes';
  return new;
end;
$$;

create trigger fail_stale_seller_answer_checks
  before insert on public.seller_answer_check
  for each row execute function odb.fail_stale_seller_answer_checks();

create or replace function public.start_seller_answer_check(p_message_id uuid)
  returns uuid
  language sql security invoker
  set search_path = '' as $$
  insert into public.seller_answer_check (message_id) values (p_message_id) returning id;
$$;

revoke all on function public.start_seller_answer_check(uuid) from public, anon, service_role;
grant execute on function public.start_seller_answer_check(uuid) to authenticated;

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.seller_answer_check
  for each row execute function odb.refuse_write_when_team_locked('members', 'question_id', 'seller_room_question');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_answer_check
  for each row execute function odb.refuse_personal_account_row();

-- Worked out on read, never stored: a check is stale once, since it started,
-- the seller has answered the question again, a file has been attached to the
-- question, or a deal document has arrived or had its text land, since the
-- check may not have read it.
create or replace function public.seller_answer_check_is_stale(c public.seller_answer_check)
  returns boolean
  language sql stable
  set search_path = '' as $$
  select exists (
      select 1
      from public.seller_room_question_message checked
      join public.seller_room_question_message later
        on later.question_id = checked.question_id and later.side = 'seller' and later.created_at > checked.created_at
      where checked.id = c.message_id
    )
    or exists (
      select 1 from public.dr_document d
      where d.deal_id = c.deal_id
        and d.removed_at is null
        and d.created_at > c.created_at
    )
    or exists (
      select 1
      from public.document_segment s
      join public.dr_document d on d.id = s.dr_document_id
      where s.deal_id = c.deal_id
        and d.removed_at is null
        and s.created_at > c.created_at
    )
    or exists (
      select 1 from public.seller_room_question_file f
      where f.question_id = c.question_id
        and f.created_at > c.created_at
    );
$$;

revoke all on function public.seller_answer_check_is_stale(public.seller_answer_check) from public, anon;
grant execute on function public.seller_answer_check_is_stale(public.seller_answer_check) to authenticated, service_role;

-- Buyer's counsel see results only, never steps, model, credits or requester,
-- and each finding cites only documents counsel can open.
create or replace function public.buyer_counsel_seller_answer_checks(deal_id uuid)
  returns table (
    id uuid,
    question_id uuid,
    message_id uuid,
    status public.seller_answer_check_status,
    overall public.seller_answer_check_overall,
    findings jsonb,
    follow_up text,
    created_at timestamptz,
    finished_at timestamptz,
    stale boolean
  )
  language sql stable security definer
  set search_path = '' as $$
  with readable as (
    select d.id from public.buyer_counsel_documents(buyer_counsel_seller_answer_checks.deal_id) d
  )
  select c.id, c.question_id, c.message_id, c.status, c.overall,
         (
           select coalesce(jsonb_agg(f.finding || jsonb_build_object('citations', coalesce((
             select jsonb_agg(ct.citation order by ct.n)
             from jsonb_array_elements(f.finding -> 'citations') with ordinality as ct(citation, n)
             where (ct.citation ->> 'documentId')::uuid in (select r.id from readable r)
           ), '[]'::jsonb)) order by f.n), '[]'::jsonb)
           from jsonb_array_elements(c.findings) with ordinality as f(finding, n)
         ),
         c.follow_up, c.created_at, c.finished_at,
         public.seller_answer_check_is_stale(c)
  from public.seller_answer_check c
  where c.deal_id = buyer_counsel_seller_answer_checks.deal_id
    and public.is_deal_counsel(buyer_counsel_seller_answer_checks.deal_id, 'buyer')
  order by c.created_at desc, c.id;
$$;

revoke all on function public.buyer_counsel_seller_answer_checks(uuid) from public, anon, service_role;
grant execute on function public.buyer_counsel_seller_answer_checks(uuid) to authenticated;

alter table public.ai_call_log
  add column seller_answer_check_id uuid references public.seller_answer_check (id) on delete set null;

alter table public.ai_call_log
  add constraint ai_call_log_one_subject check (num_nonnulls(question_id, lender_ask_ai_draft_id, seller_answer_check_id) <= 1);

create index ix_ai_call_log_seller_answer_check on public.ai_call_log (seller_answer_check_id);

create trigger same_team_seller_answer_check_id
  before insert or update on public.ai_call_log
  for each row execute function odb.refuse_cross_team_link('account_id', '', 'seller_answer_check_id', 'seller_answer_check');

drop function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid, uuid, uuid);

-- Reserves an AI call's estimated credits against the team's monthly cap:
-- under a per-team lock, it logs the call holding the estimate unless that
-- would pass the cap, and returns the log row's id, or null when it would. A
-- call costing no credits (a model with no known price) is always logged. A
-- hold left unsettled for over an hour belongs to a crashed worker, so it is
-- released first and stops counting.
create or replace function public.reserve_ai_call(
  p_account_id uuid,
  p_model text,
  p_credits numeric,
  p_endpoint_id uuid default null,
  p_firm_id uuid default null,
  p_deal_id uuid default null,
  p_created_by uuid default null,
  p_question_id uuid default null,
  p_lender_ask_ai_draft_id uuid default null,
  p_seller_answer_check_id uuid default null
) returns uuid
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_call_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_call_cap:' || p_account_id::text, 0));
  update public.ai_call_log
  set credits = 0, settled_at = now()
  where account_id = p_account_id
    and settled_at is null
    and created_at < now() - interval '1 hour';
  if p_credits > 0
     and public.ai_credits_used_this_month(p_account_id) + p_credits
     > coalesce((select ai_monthly_credit_cap from public.outreach_setting where account_id = p_account_id), 0) then
    return null;
  end if;
  insert into public.ai_call_log (account_id, model, credits, endpoint_id, firm_id, deal_id, created_by, question_id,
    lender_ask_ai_draft_id, seller_answer_check_id)
  values (p_account_id, p_model, p_credits, p_endpoint_id, p_firm_id, p_deal_id, p_created_by, p_question_id,
    p_lender_ask_ai_draft_id, p_seller_answer_check_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

revoke all on function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to service_role;
