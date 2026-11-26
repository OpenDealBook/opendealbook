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
