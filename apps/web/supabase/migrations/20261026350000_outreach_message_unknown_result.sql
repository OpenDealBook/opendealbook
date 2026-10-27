alter table public.outreach_message drop constraint outreach_message_status_check;
alter table public.outreach_message add constraint outreach_message_status_check
  check (status in ('sending', 'sent', 'failed', 'unknown'));
