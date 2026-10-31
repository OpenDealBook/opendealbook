-- A saver with deals.manage may lack deals.work and so not see some rooms, and
-- every matching room of the team must still link. The room-insert trigger
-- matches it, so linking never depends on what the room's creator may read.
alter function odb.link_rooms_to_saved_lender() security definer;
alter function odb.link_new_room_to_saved_lender() security definer;
