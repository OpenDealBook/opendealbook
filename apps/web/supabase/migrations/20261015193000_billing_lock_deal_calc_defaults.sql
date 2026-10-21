-- Compiled from supabase/schemas/99c-billing-lock.sql; edit that file, not this one.

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.deal_calc_defaults
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');
