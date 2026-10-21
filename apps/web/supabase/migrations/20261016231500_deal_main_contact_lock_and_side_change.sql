-- A locked team's main contacts pass the lock only when a removal clears them
-- from inside another trigger, and a contact who changes side loses their
-- star. Compiled from supabase/schemas/99g-deal-people.sql; edit that file.

-- A contact moved to another side has left the side they were starred on.
create or replace function public.clear_main_contact_on_side_change()
  returns trigger
  language plpgsql security definer
  set search_path = '' as $$
begin
  delete from public.deal_main_contact mc
  where mc.deal_id = old.deal_id and mc.contact_id = old.contact_id and mc.side = old.side;
  return new;
end;
$$;

create trigger clear_main_contact_on_side_change
  before update of side on public.deal_contact
  for each row when (old.side is distinct from new.side)
  execute function public.clear_main_contact_on_side_change();

drop trigger refuse_write_when_team_locked on public.deal_main_contact;

create trigger refuse_write_when_team_locked
  before insert or update on public.deal_main_contact
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');

-- A star cleared inside another trigger, because its person left, goes with
-- that removal, which a locked team may still make. Direct deletes are refused.
create trigger refuse_delete_when_team_locked
  before delete on public.deal_main_contact
  for each row when (pg_trigger_depth() = 0)
  execute function tuckin.refuse_write_when_team_locked('members', 'deal_id', 'deal');
