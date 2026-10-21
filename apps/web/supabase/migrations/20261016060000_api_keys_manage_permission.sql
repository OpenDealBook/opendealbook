-- Compiled from supabase/schemas/01-enums.sql. The new value is used in the next
-- migration because Postgres cannot use an enum value in the transaction that adds it.

alter type public.app_permissions add value if not exists 'api_keys.manage';
