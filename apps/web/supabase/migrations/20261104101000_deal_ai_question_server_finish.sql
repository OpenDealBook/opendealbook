-- Only the server finishes a question, so nobody signed in can write an answer
-- or its citations, and the asker deletes a question only once it finished.
revoke update on public.deal_ai_question from authenticated;
drop policy deal_ai_question_finish on public.deal_ai_question;

revoke update, delete on public.deal_ai_thread from service_role;
revoke delete on public.deal_ai_question from service_role;

drop policy deal_ai_question_delete on public.deal_ai_question;
create policy deal_ai_question_delete on public.deal_ai_question
  for delete to authenticated
  using (asked_by = (select auth.uid()) and status <> 'running');

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

-- 32000 characters is about 8k tokens: the most one read hands the model. The
-- segment that crosses the cap is cut there and later ones are left out. Every
-- row says whether the cap cut the read, and next_page is the first page whose
-- text was cut or left out, or the page after a first page that alone passes
-- the cap, so rereading never returns the same text.
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

grant execute on function public.read_document_pages(uuid, int, int) to authenticated, service_role;

drop function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid);

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
  p_question_id uuid default null
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
  insert into public.ai_call_log (account_id, model, credits, endpoint_id, firm_id, deal_id, created_by, question_id)
  values (p_account_id, p_model, p_credits, p_endpoint_id, p_firm_id, p_deal_id, p_created_by, p_question_id)
  returning id into v_call_id;
  return v_call_id;
end;
$$;

revoke all on function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, numeric, uuid, uuid, uuid, uuid, uuid) to service_role;
