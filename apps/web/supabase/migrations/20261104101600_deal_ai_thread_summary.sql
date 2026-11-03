-- One row per thread that holds a question, for listing threads newest first.
create index ix_deal_ai_question_thread_created on public.deal_ai_question (thread_id, created_at);
drop index public.ix_deal_ai_question_thread;

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
