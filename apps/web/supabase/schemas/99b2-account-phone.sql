-- A person's own optional phone, shown wherever the deal lists them, and when
-- they were last asked for it on entering a room.

alter table public.accounts add column phone text;

alter table public.accounts add constraint accounts_personal_phone check (
  phone is null or is_personal_account
);

alter table public.accounts add column phone_asked_at timestamptz;

alter table public.accounts add constraint accounts_phone_length check (
  length(phone) <= 50
);

grant update (phone, phone_asked_at) on public.accounts to authenticated;
