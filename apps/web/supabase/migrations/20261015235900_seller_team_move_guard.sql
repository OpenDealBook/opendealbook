-- Seller rows never move to another team.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.

create trigger refuse_team_move
  before update on public.seller_room_activity
  for each row execute function tuckin.refuse_team_move();

create trigger refuse_team_move
  before update on public.seller_send_limit
  for each row execute function tuckin.refuse_team_move();
