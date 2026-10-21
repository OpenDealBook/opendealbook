-- Seller uploads go through the shared upload pipeline.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.
alter table public.seller_upload
  add column if not exists folder_id uuid not null references public.dr_folder (id) on delete cascade,
  add column if not exists keep_as_zip boolean;

create trigger same_team_folder_id
  before insert or update on public.seller_upload
  for each row execute function tuckin.refuse_cross_team_link('deal_id', 'deal', 'folder_id', 'dr_folder');

create policy lender_oversize_file_seller_read on public.lender_oversize_file
  for select to authenticated
  using (public.seller_can_read_folder(dr_folder_id));
