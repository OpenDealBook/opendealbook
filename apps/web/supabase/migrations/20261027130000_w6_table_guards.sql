create trigger refuse_write_when_team_locked
  before insert or update or delete on public.lead_pull
  for each row execute function tuckin.refuse_write_when_team_locked('members', 'account_id');

create trigger refuse_personal_account_row
  before insert or update of account_id on public.lead_pull
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.letter_template
  for each row execute function tuckin.refuse_personal_account_row();
