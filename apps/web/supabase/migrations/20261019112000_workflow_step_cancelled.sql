-- Compiled from supabase/schemas/99s-workflows.sql. The new value is used in the
-- next migration because Postgres cannot use an enum value in the transaction that adds it.

alter type public.workflow_step_status add value if not exists 'cancelled';
