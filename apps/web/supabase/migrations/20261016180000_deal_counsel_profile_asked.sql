-- Counsel are asked once, on first portal entry, for their name and phone.
-- Compiled from supabase/schemas/99f-deal-counsel.sql; edit that file.

alter table public.deal_counsel add column if not exists profile_asked_at timestamptz;
