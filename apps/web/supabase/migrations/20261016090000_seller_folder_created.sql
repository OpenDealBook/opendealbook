-- Sellers' new folders in their room's uploads are recorded like lenders'.
-- Compiled from supabase/schemas/99e-seller-rooms.sql; edit that file, not this one.

alter type public.seller_activity_action add value if not exists 'folder_created';
