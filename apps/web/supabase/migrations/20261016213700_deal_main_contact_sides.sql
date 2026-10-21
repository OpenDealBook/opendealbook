-- A main contact belongs to its side, and is cleared when that person leaves
-- the side. Compiled from supabase/schemas/99g-deal-people.sql; edit that file.

alter table public.deal_contact
  add constraint deal_contact_deal_id_contact_id_side_key unique (deal_id, contact_id, side);

alter table public.deal_main_contact
  drop constraint deal_main_contact_deal_id_contact_id_fkey,
  add constraint deal_main_contact_deal_id_contact_id_side_fkey
    foreign key (deal_id, contact_id, side) references public.deal_contact (deal_id, contact_id, side) on delete cascade,
  add constraint deal_main_contact_check2 check (side <> 'lender' or contact_id is null);

create or replace function public.main_contact_on_side(
  deal_id uuid, side public.deal_side, lender_room_id uuid, user_id uuid
)
  returns boolean
  language sql stable security definer
  set search_path = '' as $$
  select case main_contact_on_side.side
    when 'lender' then exists (
      select 1 from public.lender_room_member m
      where m.room_id = main_contact_on_side.lender_room_id and m.user_id = main_contact_on_side.user_id
    )
    when 'buyer' then exists (
      select 1 from public.deal d
      join public.accounts_memberships am on am.account_id = d.account_id
      where d.id = main_contact_on_side.deal_id and am.user_id = main_contact_on_side.user_id
    ) or exists (
      select 1 from public.deal_counsel c
      where c.deal_id = main_contact_on_side.deal_id and c.side = 'buyer'
        and c.user_id = main_contact_on_side.user_id
    )
    when 'seller' then exists (
      select 1 from public.seller_room_member m
      join public.seller_room r on r.id = m.room_id
      where r.deal_id = main_contact_on_side.deal_id and m.user_id = main_contact_on_side.user_id
    ) or exists (
      select 1 from public.deal_counsel c
      where c.deal_id = main_contact_on_side.deal_id and c.side = 'seller'
        and c.user_id = main_contact_on_side.user_id
    )
  end;
$$;

revoke all on function public.main_contact_on_side(uuid, public.deal_side, uuid, uuid) from public, anon, authenticated;

create or replace function public.refuse_main_contact_off_side()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  if new.user_id is not null
    and not public.main_contact_on_side(new.deal_id, new.side, new.lender_room_id, new.user_id) then
    raise exception 'a main contact must be on its side' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger main_contact_on_side
  before insert or update on public.deal_main_contact
  for each row execute function public.refuse_main_contact_off_side();

-- A person who leaves a side loses any star they held on it: leaving the
-- team, a lender room or the seller room, or being removed as counsel.
-- Someone still on the side another way keeps theirs.
create or replace function public.clear_departed_main_contacts()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.deal_main_contact mc
  where mc.user_id = old.user_id
    and not public.main_contact_on_side(mc.deal_id, mc.side, mc.lender_room_id, mc.user_id);
  return old;
end;
$$;

create trigger clear_departed_main_contacts
  after delete on public.accounts_memberships
  for each row execute function public.clear_departed_main_contacts();

create trigger clear_departed_main_contacts
  after delete on public.lender_room_member
  for each row execute function public.clear_departed_main_contacts();

create trigger clear_departed_main_contacts
  after delete on public.seller_room_member
  for each row execute function public.clear_departed_main_contacts();

create trigger clear_departed_main_contacts
  after delete on public.deal_counsel
  for each row execute function public.clear_departed_main_contacts();

drop trigger refuse_write_when_team_locked on public.deal_main_contact;

-- Only direct writes are refused. A star cleared because its person left goes
-- with that removal, which a locked team may still make.
create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_main_contact
  for each row when (pg_trigger_depth() = 0) execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');
