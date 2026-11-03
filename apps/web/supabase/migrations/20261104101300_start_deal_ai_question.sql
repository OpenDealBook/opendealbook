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

revoke all on function public.start_deal_ai_question(uuid, text, uuid) from public, anon;
grant execute on function public.start_deal_ai_question(uuid, text, uuid) to authenticated, service_role;
