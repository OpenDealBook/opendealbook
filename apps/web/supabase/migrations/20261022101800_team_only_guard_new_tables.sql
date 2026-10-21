create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_room_comment
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.seller_counsel_folder
  for each row execute function tuckin.refuse_personal_account_row();

create trigger refuse_personal_account_row
  before insert or update of account_id on public.team_home_visit
  for each row execute function tuckin.refuse_personal_account_row();
