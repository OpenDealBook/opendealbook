alter table public.deal_update_recipient drop constraint deal_update_recipient_check;
alter table public.deal_update_recipient add constraint deal_update_recipient_check
  check (user_id is null or contact_id is null);

alter table public.deal_update_recipient drop constraint deal_update_recipient_user_id_fkey;
alter table public.deal_update_recipient add constraint deal_update_recipient_user_id_fkey
  foreign key (user_id) references auth.users on delete set null;

alter table public.deal_update_recipient drop constraint deal_update_recipient_contact_id_fkey;
alter table public.deal_update_recipient add constraint deal_update_recipient_contact_id_fkey
  foreign key (contact_id) references public.contact (id) on delete set null;
