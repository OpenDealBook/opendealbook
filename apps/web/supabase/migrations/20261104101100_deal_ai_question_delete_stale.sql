-- The asker may delete a question that has run for over 10 minutes, the same
-- as a finished one.
drop policy deal_ai_question_delete on public.deal_ai_question;

create policy deal_ai_question_delete on public.deal_ai_question
  for delete to authenticated
  using (
    asked_by = (select auth.uid())
    and (status <> 'running' or created_at < now() - interval '10 minutes')
  );
