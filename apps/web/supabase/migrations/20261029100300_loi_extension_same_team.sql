create trigger same_team_parent_contract_id
  before insert or update on public.contract
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'parent_contract_id', 'contract');
