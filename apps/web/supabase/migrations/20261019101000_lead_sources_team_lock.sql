create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_email
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.provider_credential
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_verdict
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_endpoint_id
  before insert or update on public.firm_verdict
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'endpoint_id', 'llm_endpoint');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.firm_verdict_approval
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_write_when_team_locked
  before insert or update or delete on public.outreach_letter
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger same_team_firm_id
  before insert or update on public.ai_call_log
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'firm_id', 'firm');
