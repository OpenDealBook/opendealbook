-- Deal people: contact.company, hand-added deal contacts and main contacts,
-- with their access rules and billing-lock triggers. Compiled from
-- supabase/schemas/21-contact.sql and supabase/schemas/99g-deal-people.sql;
-- edit those files.

alter table public.contact add column if not exists company text;

-- People on a deal. Team members, room members and counsel come from their own
-- tables; only outside people the team adds by hand live here, as address book
-- contacts placed on a deal. Each side has one main contact, and the lender
-- side has one per lender room.

create table if not exists public.deal_contact (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  deal_id uuid not null references public.deal (id) on delete cascade,
  contact_id uuid not null references public.contact (id) on delete cascade,
  side public.deal_side not null,
  role public.deal_person_role not null,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  unique (deal_id, contact_id)
);

create index if not exists ix_deal_contact_contact on public.deal_contact (contact_id);

alter table public.deal_contact enable row level security;

revoke all on public.deal_contact from anon, authenticated, service_role;
grant select, insert, update, delete on public.deal_contact to authenticated;
grant select, insert, update, delete on public.deal_contact to service_role;

create trigger deal_contact_timestamps
  before insert or update on public.deal_contact
  for each row execute function public.set_timestamps();

create trigger deal_contact_user_tracking
  before insert or update on public.deal_contact
  for each row execute function public.set_user_tracking();

create policy deal_contact_read on public.deal_contact
  for select to authenticated
  using (public.has_role_on_account(account_id));

create policy deal_contact_insert on public.deal_contact
  for insert to authenticated
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy deal_contact_update on public.deal_contact
  for update to authenticated
  using (public.manages_deal_in_account(deal_id, account_id))
  with check (public.manages_deal_in_account(deal_id, account_id));

create policy deal_contact_delete on public.deal_contact
  for delete to authenticated
  using (public.manages_deal_in_account(deal_id, account_id));

-- The composite keys keep a star on someone of this deal: a hand-added contact
-- placed on it, or one of its own lender rooms.
create table if not exists public.deal_main_contact (
  deal_id uuid not null references public.deal (id) on delete cascade,
  side public.deal_side not null,
  lender_room_id uuid,
  user_id uuid references auth.users on delete cascade,
  contact_id uuid,
  unique nulls not distinct (deal_id, side, lender_room_id),
  foreign key (lender_room_id, deal_id) references public.lender_room (id, deal_id) on delete cascade,
  foreign key (deal_id, contact_id) references public.deal_contact (deal_id, contact_id) on delete cascade,
  check ((user_id is null) <> (contact_id is null)),
  check ((side = 'lender') = (lender_room_id is not null))
);

alter table public.deal_main_contact enable row level security;

revoke all on public.deal_main_contact from anon, authenticated, service_role;
grant select, insert, update, delete on public.deal_main_contact to authenticated;
grant select, insert, update, delete on public.deal_main_contact to service_role;

create policy deal_main_contact_read on public.deal_main_contact
  for select to authenticated
  using (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.has_role_on_account(d.account_id)
  ));

create policy deal_main_contact_insert on public.deal_main_contact
  for insert to authenticated
  with check (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ));

create policy deal_main_contact_update on public.deal_main_contact
  for update to authenticated
  using (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ))
  with check (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ));

create policy deal_main_contact_delete on public.deal_main_contact
  for delete to authenticated
  using (exists (
    select 1 from public.deal d
    where d.id = deal_id and public.manages_deal_in_account(d.id, d.account_id)
  ));

-- ---- Billing lock ----

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_main_contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

create trigger same_team_deal_id
  before insert or update on public.deal_contact
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_contact_id
  before insert or update on public.deal_contact
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'contact_id', 'contact');
