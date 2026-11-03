-- Only a signed-in user starts a question; the server has no asker to record.
revoke execute on function public.start_deal_ai_question(uuid, text, uuid) from service_role;
