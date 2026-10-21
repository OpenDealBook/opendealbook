-- The server names a team message's id up front so it can email about it;
-- authenticated cannot read the row back after inserting it.
grant insert (id) on public.counsel_message to authenticated;
