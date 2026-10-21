create trigger same_team_deal_id
  before insert or update on public.notifications
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');
