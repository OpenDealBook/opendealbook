-- Why a lender draft or answer check failed, set exactly when it failed;
-- runs swept as stale are 'interrupted'. Buyer's counsel see the reason too.
create type public.ai_run_failure_reason as enum ('too_long', 'no_submit', 'failed', 'interrupted');

alter table public.lender_ask_ai_draft add column failure_reason public.ai_run_failure_reason;
alter table public.seller_answer_check add column failure_reason public.ai_run_failure_reason;

update public.lender_ask_ai_draft set failure_reason = 'failed' where status = 'failed';
update public.seller_answer_check set failure_reason = 'failed' where status = 'failed';

alter table public.lender_ask_ai_draft
  add constraint lender_ask_ai_draft_failure_reason_when_failed check ((status = 'failed') = (failure_reason is not null));
alter table public.seller_answer_check
  add constraint seller_answer_check_failure_reason_when_failed check ((status = 'failed') = (failure_reason is not null));

grant update (failure_reason) on public.lender_ask_ai_draft to service_role;
grant update (failure_reason) on public.seller_answer_check to service_role;

create or replace function odb.fail_stale_lender_ask_ai_drafts()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.lender_ask_ai_draft
  set status = 'failed', failure_reason = 'interrupted', finished_at = now()
  where ask_id = new.ask_id
    and (requested_by = new.requested_by or requested_by is null)
    and status = 'running'
    and created_at < now() - interval '10 minutes';
  return new;
end;
$$;

drop function public.buyer_counsel_seller_answer_checks(uuid);

create or replace function public.buyer_counsel_seller_answer_checks(deal_id uuid)
  returns table (
    id uuid,
    question_id uuid,
    message_id uuid,
    status public.seller_answer_check_status,
    failure_reason public.ai_run_failure_reason,
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
  select c.id, c.question_id, c.message_id, c.status, c.failure_reason, c.overall,
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

-- Anyone who works the deal reads a room's FAQ and opens its files, as they
-- read its documents.
create or replace function public.lender_room_faq(room_id uuid, query text default null)
  returns table (
    id uuid,
    question text,
    answer text,
    pinned boolean,
    first_published_at timestamptz,
    updated_at timestamptz,
    files jsonb
  )
  language sql stable security definer
  set search_path = '' as $$
  select
    e.id,
    e.question,
    e.answer,
    e.pinned,
    e.first_published_at,
    e.updated_at,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
        from public.lender_faq_file f
        where f.entry_id = e.id
      ),
      '[]'::jsonb
    )
  from public.lender_faq_entry e
  cross join (select replace(plainto_tsquery('english', lender_room_faq.query)::text, ' & ', ' | ')::tsquery as q) s
  where (
      public.is_lender_room_member(lender_room_faq.room_id)
      or public.can_manage_lender_room(lender_room_faq.room_id)
      or public.can_work_lender_room(lender_room_faq.room_id)
    )
    and public.lender_room_shows_faq_entry_unchecked(lender_room_faq.room_id, e.id)
    and (lender_room_faq.query is null or e.search_tsv @@ s.q)
  order by ts_rank(e.search_tsv, s.q) desc nulls last, e.pinned desc, e.first_published_at desc, e.id;
$$;

create or replace function public.lender_room_shows_faq_file(room_id uuid, file_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select (
      public.is_lender_room_member(lender_room_shows_faq_file.room_id)
      or public.can_manage_lender_room(lender_room_shows_faq_file.room_id)
      or public.can_work_lender_room(lender_room_shows_faq_file.room_id)
    )
    and exists (
      select 1 from public.lender_faq_file f
      where f.id = lender_room_shows_faq_file.file_id
        and public.lender_room_shows_faq_entry_unchecked(lender_room_shows_faq_file.room_id, f.entry_id)
    );
$$;

-- A check needs its answer to still be the latest message in the thread, and
-- one check runs per answer whoever started it, so the stale sweep fails
-- anyone's stale run of that answer.
create or replace function odb.derive_seller_answer_check_scope()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
declare
  v_side public.seller_side;
  v_created_at timestamptz;
begin
  select m.side, m.created_at, m.question_id, q.room_id, q.account_id, r.deal_id
  into v_side, v_created_at, new.question_id, new.room_id, new.account_id, new.deal_id
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
  perform 1 from public.seller_room_question q where q.id = new.question_id for update;
  if exists (
    select 1 from public.seller_room_question_message later
    where later.question_id = new.question_id
      and (later.created_at, later.id) > (v_created_at, new.message_id)
  ) then
    raise exception 'only the latest message in a thread is checked' using errcode = 'ODB03';
  end if;
  return new;
end;
$$;

-- Only the newest running check of each message survives the narrower index.
update public.seller_answer_check c
set status = 'failed', failure_reason = 'interrupted', finished_at = now()
where c.status = 'running'
  and exists (
    select 1 from public.seller_answer_check newer
    where newer.message_id = c.message_id
      and newer.status = 'running'
      and (newer.created_at, newer.id) > (c.created_at, c.id)
  );

drop index public.ux_seller_answer_check_one_running;
create unique index ux_seller_answer_check_one_running on public.seller_answer_check (message_id) where status = 'running';

create or replace function odb.fail_stale_seller_answer_checks()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.seller_answer_check
  set status = 'failed', failure_reason = 'interrupted', finished_at = now()
  where message_id = new.message_id
    and status = 'running'
    and created_at < now() - interval '10 minutes';
  return new;
end;
$$;
