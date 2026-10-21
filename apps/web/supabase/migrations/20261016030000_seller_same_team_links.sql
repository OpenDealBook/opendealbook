-- Seller links stay within one team.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.
create trigger same_team_generated_document_id
  before insert or update on public.document_share
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'generated_document_id', 'generated_document');

create trigger same_team_room_id
  before insert or update on public.document_share
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'room_id', 'seller_room');

create trigger same_team_deal_id
  before insert or update on public.seller_room
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'deal_id', 'deal');

create trigger same_team_uploads_folder_id
  before insert or update on public.seller_room
  for each row execute function tuckin.refuse_cross_team_link('account_id', '', 'uploads_folder_id', 'dr_folder');

create trigger same_team_dr_folder_id
  before insert or update on public.seller_room_folder
  for each row execute function tuckin.refuse_cross_team_link('room_id', 'seller_room', 'dr_folder_id', 'dr_folder');

create trigger same_team_meeting_id
  before insert or update on public.seller_room_meeting
  for each row execute function tuckin.refuse_cross_team_link('room_id', 'seller_room', 'meeting_id', 'meeting');

create trigger same_team_lender_ask_id
  before insert or update on public.seller_room_question_route
  for each row execute function tuckin.refuse_cross_team_link('question_id', 'seller_room_question', 'lender_ask_id', 'lender_ask');
