drop policy outreach_message_insert on public.outreach_message;
drop policy outreach_message_update on public.outreach_message;

revoke insert, update on public.outreach_message from authenticated;
revoke update on public.outreach_message from service_role;
grant update (status, provider_message_id, sent_at, error) on public.outreach_message to service_role;
