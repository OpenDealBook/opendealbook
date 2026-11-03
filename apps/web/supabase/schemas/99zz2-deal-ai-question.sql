-- Saved AI questions about a deal, in threads of follow-ups. The whole deal
-- team reads them; the web route asks a question as its asker and finishes it
-- with the service role, so nobody signed in can write an answer or its
-- citations. Only the asker deletes a question, once it has finished or has
-- run for over 10 minutes. A thread holds up to 20 questions, and a person
-- runs one question at a time.

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
grant select, insert on public.deal_ai_thread to service_role;

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
  tsv tsvector generated always as (to_tsvector('english', question || ' ' || coalesce(answer, ''))) stored,
  foreign key (thread_id, deal_id) references public.deal_ai_thread (id, deal_id) on delete cascade,
  constraint deal_ai_question_finished check ((status = 'running') = (finished_at is null))
);

create index ix_deal_ai_question_thread_created on public.deal_ai_question (thread_id, created_at);
create index ix_deal_ai_question_deal on public.deal_ai_question (deal_id);
create index ix_deal_ai_question_tsv on public.deal_ai_question using gin (tsv);
create unique index ux_deal_ai_question_one_running on public.deal_ai_question (asked_by) where status = 'running';

alter table public.deal_ai_question enable row level security;

revoke all on public.deal_ai_question from anon, authenticated, service_role;
grant select, delete on public.deal_ai_question to authenticated;
grant insert (id, thread_id, deal_id, question) on public.deal_ai_question to authenticated;
grant select, insert, update on public.deal_ai_question to service_role;

create policy deal_ai_question_read on public.deal_ai_question
  for select to authenticated
  using (public.has_deal_permission(deal_id, 'deals.work'));

create policy deal_ai_question_insert on public.deal_ai_question
  for insert to authenticated
  with check (asked_by = (select auth.uid()) and public.has_deal_permission(deal_id, 'deals.work'));

create policy deal_ai_question_delete on public.deal_ai_question
  for delete to authenticated
  using (
    asked_by = (select auth.uid())
    and (status <> 'running' or created_at < now() - interval '10 minutes')
  );

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_ai_question
  for each row execute function odb.refuse_write_when_team_locked('members', 'deal_id', 'deal');

-- A question still running 10 minutes after it was asked belongs to a crashed
-- request; it fails when its asker asks again, so it no longer blocks them.
create or replace function odb.fail_stale_deal_ai_questions()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  update public.deal_ai_question
  set status = 'failed', finished_at = now()
  where asked_by = new.asked_by
    and status = 'running'
    and created_at < now() - interval '10 minutes';
  return new;
end;
$$;

create trigger fail_stale_deal_ai_questions
  before insert on public.deal_ai_question
  for each row execute function odb.fail_stale_deal_ai_questions();

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

-- Starts a thread with its first question, or adds a question to the thread
-- given, in one statement, so a refused question leaves no empty thread.
create or replace function public.start_deal_ai_question(p_deal_id uuid, p_question text, p_thread_id uuid default null)
  returns table (question_id uuid, thread_id uuid)
  language plpgsql security invoker
  set search_path = '' as $$
declare
  v_thread_id uuid := p_thread_id;
  v_question_id uuid;
begin
  if v_thread_id is null then
    insert into public.deal_ai_thread (deal_id) values (p_deal_id) returning id into v_thread_id;
  end if;
  insert into public.deal_ai_question (thread_id, deal_id, question)
  values (v_thread_id, p_deal_id, p_question)
  returning id into v_question_id;
  return query select v_question_id, v_thread_id;
end;
$$;

revoke all on function public.start_deal_ai_question(uuid, text, uuid) from public, anon, service_role;
grant execute on function public.start_deal_ai_question(uuid, text, uuid) to authenticated;

-- Answered questions on the deal that match the query, best match first and
-- newest first among equals. Running, failed and out-of-credits questions are
-- left out.
create or replace function public.search_deal_ai_answers(p_deal_id uuid, p_query text, p_limit int default 5)
  returns table (question_id uuid, thread_id uuid, question text, answer text, asked_at timestamptz, rank real)
  language sql stable security invoker
  set search_path = '' as $$
  select q.id, q.thread_id, q.question, q.answer, q.created_at, ts_rank(q.tsv, query.q)
  from public.deal_ai_question q
  cross join websearch_to_tsquery('english', p_query) as query(q)
  where q.deal_id = p_deal_id
    and q.status = 'answered'
    and q.tsv @@ query.q
  order by 6 desc, q.created_at desc, q.id
  limit p_limit;
$$;

revoke all on function public.search_deal_ai_answers(uuid, text, int) from public, anon, service_role;
grant execute on function public.search_deal_ai_answers(uuid, text, int) to authenticated;

-- One row per thread that holds a question, for listing threads newest first.
create or replace view public.deal_ai_thread_summary with (security_invoker = true) as
select t.id, t.deal_id, d.account_id, f.name::text as deal_name,
  first_q.question as first_question, last_q.created_at as last_asked_at
from public.deal_ai_thread t
join public.deal d on d.id = t.deal_id
join public.firm f on f.id = d.firm_id
join lateral (
  select q.question from public.deal_ai_question q
  where q.thread_id = t.id
  order by q.created_at, q.id
  limit 1
) first_q on true
join lateral (
  select q.created_at from public.deal_ai_question q
  where q.thread_id = t.id
  order by q.created_at desc
  limit 1
) last_q on true;

revoke all on public.deal_ai_thread_summary from anon, authenticated, service_role;
grant select on public.deal_ai_thread_summary to authenticated;

alter table public.ai_call_log
  add column question_id uuid references public.deal_ai_question (id) on delete set null;

create index ix_ai_call_log_question on public.ai_call_log (question_id);
