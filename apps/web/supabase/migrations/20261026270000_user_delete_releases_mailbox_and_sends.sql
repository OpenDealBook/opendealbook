alter table public.mailbox_connection
  drop constraint mailbox_connection_user_id_fkey,
  add constraint mailbox_connection_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.lender_room_outreach
  drop constraint lender_room_outreach_sent_by_fkey,
  add constraint lender_room_outreach_sent_by_fkey foreign key (sent_by) references auth.users (id) on delete set null;
