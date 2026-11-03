alter table public.deal_ai_question
  add column tsv tsvector generated always as (to_tsvector('english', question || ' ' || coalesce(answer, ''))) stored;

create index ix_deal_ai_question_tsv on public.deal_ai_question using gin (tsv);

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
