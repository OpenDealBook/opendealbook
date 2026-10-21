-- A person's own optional phone, shown wherever the deal lists them.

alter table public.accounts add column phone text;

alter table public.accounts add constraint accounts_personal_phone check (
  phone is null or is_personal_account
);

grant update (phone) on public.accounts to authenticated;
