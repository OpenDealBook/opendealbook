create trigger refuse_personal_account_row
  before insert or update of account_id on public.workflow_loop_saved_work
  for each row execute function tuckin.refuse_personal_account_row();
